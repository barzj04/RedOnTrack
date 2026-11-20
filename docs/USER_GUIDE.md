# RedOnTrack user guide

This guide walks through each screen. Screens and buttons you don't see are hidden by your role.

## 1. Signing in

1. Enter your 8-digit **Employee ID** and **password**, then press **Sign in**.
2. In the demo, tap one of the **Demo accounts** cards to fill the form for you.
3. After 5 wrong attempts the form locks for 30 seconds.
4. New staff can choose **Create an account**. New accounts are Viewers (read only) until an administrator changes the role.

Sign out from the menu under your name, top right. On a phone, the same menu also holds the page links.

## 2. Home

- The **primary camera** plays at the top. Click it to open all cameras.
- The four tiles show cameras online, incidents logged, incidents not yet analysed, and incidents saved to the archive.
- The bar at the bottom shows the station, which analysis engine is active, and the local time.

## 3. Cameras

- Click any feed to open it **full screen**. Use the arrows (or ← → keys) to switch cameras and **Esc** to close.
- **Snapshot** saves the current frame as a PNG.
- **Record clip** starts recording; **Stop & save** saves a WebM video. You can't switch cameras while recording.
- In **Camera inventory**, use the up/down arrows to change the order of the grid.
- Status colours: green = streaming, yellow = unstable signal, grey = offline.

*Operators and administrators only:* Snapshot and Record.

## 4. Incidents

### Trend chart
- Switch **Weekly / Monthly** and **By day / By time**.
- In weekly view, use the arrows to look at earlier weeks.
- **Click a bar** to show only incidents on that day or in that time slot. Click it again, or press **Clear filter**, to show all. Time slots are 4-hour blocks: `08-12` means 08:00 to 11:59.

### Incident log
Each card shows the event ID, date, time, platform and the cameras that recorded it.

| Button | What it does | Who |
| --- | --- | --- |
| **View cameras** | Opens every camera angle recorded for the incident. Click one for full screen. | Everyone |
| **Analyse incident** / **Open analysis** | Runs or opens the safety analysis. | Run: Operator, Admin. Open: everyone |
| **Export report** | Saves a text report with remarks and analysis. | Operator, Admin |
| **Save to archive** | Keeps the incident in the Saved Archive. | Operator, Admin |

Type in the **Investigation log** box to update the remarks; changes save automatically. Better remarks give a better analysis.

### Reading an analysis
- **1. Anomaly detection**: the type of incident and likely causes.
- **2. Risk assessment**: Low, Medium or High, with a score out of 10. Night-time and peak-hour incidents score higher.
- **3. Preventative measures**: practical actions to stop it happening again.
- **4. Forensic summary**: a short paragraph for the station log.

The engine name is shown at the top. Always check the footage before acting on the analysis.

## 5. Archive

Shows only saved incidents, with the same buttons as the incident log. Press **Saved · remove from archive** to take one out.

## 6. Footage

Recordings for the last 7 days, one folder per day. Open a day, then press **Play** on a camera. Recordings older than 7 days are deleted unless saved to an incident.

## 7. Access log (administrators)

Every sign-in and sign-out with name, ID, position and times. Search by name or ID, sort by the time columns, and press **Export CSV** to download.

## Resetting the demo

All data is stored in your browser. To start fresh, clear this site's data in your browser settings.
