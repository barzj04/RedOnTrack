/**
 * Runs the RedOnTrack YOLO11n model in the browser with ONNX Runtime Web
 * (WebAssembly, CPU). The model and runtime are served from /public, so
 * nothing is sent to a server: frames never leave the device, same as the
 * edge box would work at a station.
 */

import * as ort from 'onnxruntime-web/wasm';
import { decodeYolo, letterbox, type Detection } from './detectionService';

const MODEL_URL = './model/redontrack.onnx';
const INPUT = 640;

let sessionPromise: Promise<ort.InferenceSession> | null = null;

export function loadModel(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    // Vite bundles the WebAssembly runtime into /assets, so it works offline.
    // Multi-threading needs cross-origin isolation (COOP/COEP headers); most
    // static hosts (e.g. GitHub Pages) don't send them, so fall back to 1 thread.
    ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    sessionPromise = ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] }).catch((e) => {
      sessionPromise = null;
      throw e;
    });
  }
  return sessionPromise;
}

const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

/** Letterbox a frame into a 640x640 float tensor (RGB, 0..1, CHW). */
function toTensor(source: CanvasImageSource, w: number, h: number) {
  const lb = letterbox(w, h, INPUT);
  canvas!.width = INPUT;
  canvas!.height = INPUT;
  const ctx = canvas!.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, INPUT, INPUT);
  ctx.drawImage(source, lb.padX, lb.padY, w * lb.scale, h * lb.scale);
  const { data } = ctx.getImageData(0, 0, INPUT, INPUT);
  const area = INPUT * INPUT;
  const f = new Float32Array(3 * area);
  for (let i = 0; i < area; i++) {
    f[i] = data[i * 4] / 255;
    f[area + i] = data[i * 4 + 1] / 255;
    f[2 * area + i] = data[i * 4 + 2] / 255;
  }
  return { tensor: new ort.Tensor('float32', f, [1, 3, INPUT, INPUT]), lb };
}

/** Detect people and trains in one frame. Boxes are normalised to the frame. */
export async function detect(source: CanvasImageSource, w: number, h: number, minScore = 0.25): Promise<Detection[]> {
  const session = await loadModel();
  const { tensor, lb } = toTensor(source, w, h);
  const out = await session.run({ [session.inputNames[0]]: tensor });
  const y = out[session.outputNames[0]];
  const anchors = y.dims[2];
  return decodeYolo(y.data as Float32Array, anchors, lb, minScore);
}
