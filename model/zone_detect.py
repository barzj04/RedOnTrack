"""
RedOnTrack edge script: run the model on a video or camera with the red/yellow
zones exported from the dashboard (Cameras -> gear icon -> Export zones).

Same rules as the dashboard's Live Detection page:
  * a person is placed by their feet (bottom-centre of the box)
  * red zone (track)    -> MEDIUM at once, HIGH after --red-confirm seconds
  * yellow zone (strip) -> LOW at once, MEDIUM after --yellow-dwell seconds
  * zones switch off while a confirmed train is at the platform
    (score >= --train-score, covers >= 25% of the red zone, seen for 1 s)

Usage:
  pip install ultralytics
  python model/zone_detect.py --source video.mp4 --zones zones_CAM-02.json --out annotated.mp4
  python model/zone_detect.py --source 0 --zones zones_CAM-02.json --show      # webcam

Writes events to --events (CSV): time, severity, zone, person id, dwell.
"""

import argparse
import csv
import json
import time

import cv2
import numpy as np
from ultralytics import YOLO

RISK_ORDER = ["none", "low", "medium", "high"]
COLOURS = {"red": (68, 68, 239), "yellow": (21, 204, 250), "safe": (94, 197, 34)}


def load_zones(path):
    with open(path) as f:
        z = json.load(f)
    return np.array(z["red_zone"], dtype=np.float32), np.array(z["yellow_zone"], dtype=np.float32)


def inside(pt, poly):
    return cv2.pointPolygonTest(poly.reshape(-1, 1, 2), pt, False) >= 0


def red_coverage(box, red):
    zx1, zy1 = red.min(axis=0)
    zx2, zy2 = red.max(axis=0)
    ix = max(0.0, min(box[2], zx2) - max(box[0], zx1))
    iy = max(0.0, min(box[3], zy2) - max(box[1], zy1))
    area = (zx2 - zx1) * (zy2 - zy1)
    return 0.0 if area <= 0 else ix * iy / area


def risk_for(zone, dwell, a):
    if zone == "red":
        return "high" if dwell >= a.red_confirm else "medium"
    if zone == "yellow":
        return "medium" if dwell >= a.yellow_dwell else "low"
    return "none"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", default="model/best.pt")
    p.add_argument("--source", required=True, help="video file, RTSP URL or camera index")
    p.add_argument("--zones", required=True, help="zones_CAM-xx.json exported from the dashboard")
    p.add_argument("--out", help="write annotated video here")
    p.add_argument("--events", default="events.csv")
    p.add_argument("--show", action="store_true")
    p.add_argument("--person-score", type=float, default=0.35)
    p.add_argument("--train-score", type=float, default=0.8)
    p.add_argument("--red-confirm", type=float, default=0.5)
    p.add_argument("--yellow-dwell", type=float, default=3.0)
    p.add_argument("--cooldown", type=float, default=15.0)
    a = p.parse_args()

    red, yellow = load_zones(a.zones)
    model = YOLO(a.model)
    src = int(a.source) if a.source.isdigit() else a.source
    cap = cv2.VideoCapture(src)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    writer = cv2.VideoWriter(a.out, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H)) if a.out else None
    live = isinstance(src, int) or str(src).startswith("rtsp")

    zone_since = {}  # track id -> (zone, since)
    train_seen = train_gone = None
    train_present = False
    last_incident, last_sev = -1e9, None
    start = time.time()
    frame_no = 0

    with open(a.events, "w", newline="") as f:
        log = csv.writer(f)
        log.writerow(["time_s", "severity", "zone", "person_id", "dwell_s", "message"])

        while True:
            ok, frame = cap.read()
            if not ok:
                break
            t = time.time() - start if live else frame_no / fps
            frame_no += 1

            # ByteTrack keeps person ids between frames
            r = model.track(frame, persist=True, conf=0.25, verbose=False, tracker="bytetrack.yaml")[0]
            boxes = r.boxes
            xyxyn = boxes.xyxyn.cpu().numpy() if len(boxes) else np.zeros((0, 4))
            cls = boxes.cls.cpu().numpy().astype(int) if len(boxes) else []
            conf = boxes.conf.cpu().numpy() if len(boxes) else []
            ids = boxes.id.cpu().numpy().astype(int) if boxes.id is not None else [-1] * len(boxes)

            # --- train gate ---
            seen = any(model.names[c] == "train" and s >= a.train_score and red_coverage(b, red) >= 0.25
                       for b, c, s in zip(xyxyn, cls, conf))
            if seen:
                train_gone = None
                train_seen = t if train_seen is None else train_seen
                if not train_present and t - train_seen >= 1.0:
                    train_present = True
            else:
                train_seen = None
                train_gone = t if train_gone is None else train_gone
                if train_present and t - train_gone >= 1.0:
                    train_present = False

            # --- people ---
            people = []
            for b, c, s, pid in zip(xyxyn, cls, conf, ids):
                if model.names[c] != "person" or s < a.person_score:
                    continue
                foot = (float((b[0] + b[2]) / 2), float(b[3]))
                zone = "safe" if train_present else "red" if inside(foot, red) else "yellow" if inside(foot, yellow) else "safe"
                prev = zone_since.get(pid)
                if prev is None or prev[0] != zone:
                    zone_since[pid] = (zone, t)
                dwell = t - zone_since[pid][1]
                people.append((pid, b, zone, dwell, risk_for(zone, dwell, a)))

            # --- incident ---
            loggable = [p for p in people if p[4] == "high" or (p[2] == "yellow" and p[4] == "medium")]
            loggable.sort(key=lambda p: (RISK_ORDER.index(p[4]), p[3]), reverse=True)
            if loggable:
                pid, _, zone, dwell, sev = loggable[0]
                escalates = sev == "high" and last_sev == "medium"
                if t - last_incident >= a.cooldown or escalates:
                    last_incident, last_sev = t, sev
                    msg = (f"Person #{pid} entered the track (red zone) with no train at the platform."
                           if zone == "red" else f"Person #{pid} stayed in the yellow strip for {dwell:.1f} s.")
                    log.writerow([f"{t:.2f}", sev, zone, pid, f"{dwell:.2f}", msg])
                    f.flush()
                    print(f"[{t:7.2f}s] {sev.upper():6} {msg}")

            # --- draw ---
            if writer or a.show:
                vis = frame.copy()
                if not train_present:
                    for poly, col in ((red, COLOURS["red"]), (yellow, COLOURS["yellow"])):
                        pts = (poly * [W, H]).astype(np.int32)
                        overlay = vis.copy()
                        cv2.fillPoly(overlay, [pts], col)
                        vis = cv2.addWeighted(overlay, 0.2, vis, 0.8, 0)
                        cv2.polylines(vis, [pts], True, col, 2)
                for pid, b, zone, dwell, sev in people:
                    x1, y1, x2, y2 = (b * [W, H, W, H]).astype(int)
                    cv2.rectangle(vis, (x1, y1), (x2, y2), COLOURS[zone], 2)
                    label = f"#{pid} {zone.upper()}" + (f" {dwell:.1f}s" if zone != "safe" else "")
                    cv2.putText(vis, label, (x1, max(15, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOURS[zone], 2)
                worst = max((p[4] for p in people), key=RISK_ORDER.index, default="none")
                status = "TRAIN PRESENT: ZONES DISABLED" if train_present else f"ZONES ACTIVE  RISK: {worst.upper()}"
                cv2.putText(vis, status, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                if writer:
                    writer.write(vis)
                if a.show:
                    cv2.imshow("RedOnTrack", vis)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break

    cap.release()
    if writer:
        writer.release()
    cv2.destroyAllWindows()
    print(f"Events written to {a.events}")


if __name__ == "__main__":
    main()
