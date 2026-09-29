import { useEffect, useMemo, useRef, useState } from "react";
import { detectCardQuad } from "./calib/detect.ts";
import { calibrationKey, clearCalibration, readCalibration, screenLabel, trackLabel, writeCalibration, type StoredCalibration } from "./calib/store.ts";
import { calibrateViews, quadAcceptable, undistort } from "./calib/zhang.ts";
import { cameraBlocker, openRearCamera, type CameraFailure } from "./camera.ts";
import { createDistanceGuide, type DistanceBand } from "./distance/guide.ts";
import { buildScanPack, todayDate, type ScanPackResult } from "./export/pack.ts";
import { configuratorUrl, rememberPack, saveScanPack } from "./export/savePack.ts";
import { exportGlb } from "./mesh/seam.ts";
import { estimateCardPose } from "./packkit/cardPose.ts";
import { ANGLE_HEBREW, capturePlan, KIND_HEBREW, type CaptureAngle } from "./packkit/capturePlan.ts";
import { estimateMeasure } from "./packkit/estimator.ts";
import type { PartKind, ShapeHint } from "./packkit/shape.ts";
import { silhouette, type Silhouette } from "./packkit/silhouette.ts";
import type { Vec2 } from "./packkit/vec.ts";
import { drawStage } from "./stageArt.ts";
import "./scan.css";

type Phase = "intro" | "error" | "calibrate" | "distance" | "capture" | "review" | "result";

const PROMPTS = [
  "החזיקו את הכרטיס ישר, במרכז",
  "התרחקו מעט, הכרטיס עדיין ישר",
  "התקרבו, הכרטיס ישר",
  "הטו את הכרטיס שמאלה",
  "הטו את הכרטיס ימינה",
  "הטו את הכרטיס למעלה",
  "הטו את הכרטיס למטה",
  "החזיקו את הכרטיס בפינה",
  "זווית אלכסונית",
  "עוד זווית, קצת יותר רחוק",
];

const FAILURES: Record<CameraFailure, string> = {
  insecure: "המצלמה זמינה רק בחיבור מאובטח (HTTPS).",
  denied: "אין הרשאה למצלמה. אפשרו גישה למצלמה בהגדרות Safari.",
  missing: "לא נמצאה מצלמה במכשיר.",
  unavailable: "לא ניתן להפעיל את המצלמה.",
};

const BAND_TEXT: Record<DistanceBand | "lost" | "held", string> = {
  "too-close": "קרוב מדי",
  ok: "מרחק טוב",
  "too-far": "רחוק מדי",
  lost: "מחפשים את הכרטיס",
  held: "מוחזק",
};

const HINT_TEXT = { closer: "קרב", farther: "הרחק", hold: "מחזיקים את הקריאה", none: "" };

interface ShotView {
  shot: string;
  state: string;
}

interface KeptShot {
  angle: CaptureAngle;
  label: string;
  thumb: string;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  corners: Vec2[];
}

function readShot(): ShotView {
  const params = new URLSearchParams(location.search);
  return { shot: params.get("shot") ?? "", state: params.get("state") ?? "ok" };
}

export function ScanApp() {
  const shot = useMemo(readShot, []);
  const fixture = shot.shot !== "";
  const [phase, setPhase] = useState<Phase>(() => (fixture ? fixturePhase(shot.shot) : "intro"));
  const [failure, setFailure] = useState<CameraFailure | null>(() => (fixture ? null : cameraBlocker()));
  const [views, setViews] = useState<Vec2[][]>([]);
  const [reprojection, setReprojection] = useState<number | null>(fixture && shot.shot === "calibrate" ? 0.42 : null);
  const [note, setNote] = useState("");
  const [band, setBand] = useState<DistanceBand | "lost">(fixtureBand(shot));
  const [held, setHeld] = useState(shot.state === "held");
  const [distanceCm, setDistanceCm] = useState<number | null>(fixtureDistance(shot));
  const [hint, setHint] = useState(fixtureHint(shot));
  const [kind, setKind] = useState<PartKind>("bottle");
  const [step, setStep] = useState(0);
  const [shots, setShots] = useState<KeptShot[]>([]);
  const [pack, setPack] = useState<ScanPackResult | null>(null);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [shotReady, setShotReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const calibRef = useRef<StoredCalibration | null>(null);
  const keyRef = useRef("");
  const guideRef = useRef(createDistanceGuide());
  const quotedAt = todayDate();

  useEffect(() => {
    if (!fixture) return undefined;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      const canvas = sceneRef.current;
      if (canvas) {
        canvas.width = 780;
        canvas.height = 1040;
        drawStage(canvas, fixtureScene(shot));
      }
      setShotReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [fixture, shot, phase]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (fixture || (phase !== "distance" && phase !== "capture" && phase !== "calibrate")) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;
    let frame = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      frame += 1;
      if (frame % 2 === 0 && video.videoWidth > 0 && phase !== "calibrate") {
        const reading = readFrame(video, calibRef.current);
        const output = guideRef.current.push({ timeMs: performance.now(), distanceMm: reading?.distanceMm ?? null, tiltDeg: reading?.tiltDeg ?? null });
        if (output.publish) {
          setBand(output.band === "lost" ? "lost" : output.band);
          setHeld(output.held);
          setDistanceCm(output.distanceCm);
          setHint(output.hint);
        }
      }
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(id);
    };
  }, [fixture, phase]);

  async function start() {
    const opened = await openRearCamera();
    if ("error" in opened) {
      setFailure(opened.error);
      setPhase("error");
      return;
    }
    streamRef.current = opened.stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = opened.stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      await video.play();
    }
    keyRef.current = calibrationKey(navigator.userAgent, screenLabel(), trackLabel(opened.settings));
    const stored = readCalibration(keyRef.current);
    calibRef.current = stored;
    setPhase(stored ? "distance" : "calibrate");
  }

  function grab(): { width: number; height: number; rgba: Uint8ClampedArray } | null {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, rgba: image.data };
  }

  function takeCalibration() {
    const frame = grab();
    if (!frame) return;
    const quad = detectCardQuad(frame);
    if (!quad || !quadAcceptable(quad)) {
      setNote("הצילום נדחה. יישרו את הכרטיס ונסו שוב.");
      return;
    }
    const next = [...views, quad];
    setViews(next);
    setNote("");
    if (next.length >= 6) {
      const fit = calibrateViews(next.map((corners) => ({ corners })));
      if (!fit) {
        setNote("הכיול עדיין לא יציב. הוסיפו זווית אחרת.");
        setReprojection(null);
        return;
      }
      setReprojection(fit.reprojectionPx);
      const saved: StoredCalibration = {
        fx: fit.fx,
        fy: fit.fy,
        cx: fit.cx,
        cy: fit.cy,
        k1: fit.k1,
        k2: fit.k2,
        width: frame.width,
        height: frame.height,
        reprojectionPx: fit.reprojectionPx,
        views: fit.views,
        savedAt: new Date().toISOString(),
      };
      calibRef.current = saved;
      if (next.length >= 10) finishCalibration(saved);
    }
  }

  function finishCalibration(saved = calibRef.current) {
    if (!saved || views.length < 6) return;
    writeCalibration(keyRef.current, saved);
    guideRef.current.reset();
    setPhase("distance");
  }

  function recalibrate() {
    if (keyRef.current) clearCalibration(keyRef.current);
    calibRef.current = null;
    setViews([]);
    setReprojection(null);
    guideRef.current.reset();
    setPhase("calibrate");
  }

  function takePart() {
    const plan = capturePlan(kind);
    const current = plan[step];
    if (!current) return;
    const frame = grab();
    if (!frame) return;
    const quad = detectCardQuad(frame);
    if (!quad) {
      setNote("הכרטיס לא נראה בפריים.");
      return;
    }
    const thumb = thumbnail(frame);
    setShots((prev) => [...prev, { angle: current.angle, label: ANGLE_HEBREW[current.angle], thumb, ...frame, corners: quad }]);
    setNote("");
    if (step + 1 >= plan.length) setPhase("review");
    else setStep(step + 1);
  }

  function finishReview() {
    const calibration = calibRef.current;
    const front = shots.find((item) => item.angle === "side" || item.angle === "front") ?? shots[0];
    if (!calibration || !front) {
      setNote("חסר צילום עם כרטיס.");
      return;
    }
    const sx = front.width / calibration.width;
    const sy = front.height / calibration.height;
    const intrinsics = {
      fx: calibration.fx * sx,
      fy: calibration.fy * sy,
      cx: calibration.cx * sx,
      cy: calibration.cy * sy,
    };
    const undistorted = front.corners.map((point) => undistort(point, { ...intrinsics, k1: calibration.k1, k2: calibration.k2 }));
    const mask = segmentPart(front, undistorted);
    const measured = mask
      ? estimateMeasure({
          kind,
          intrinsics,
          frame: { width: front.width, height: front.height },
          reference: { kind: "card", corners: undistorted, size: { widthMm: 85.6, heightMm: 53.98 } },
          front: mask,
          capturedAt: new Date().toISOString(),
          device: navigator.userAgent.slice(0, 80),
        })
      : null;
    const dims = measured && !measured.saveBlocked
      ? measured.dimensions
      : { widthMm: 40, heightMm: 100, depthMm: 40 };
    const shape = measured?.shape ?? "cylinder";
    const built = buildScanPack({
      id: `sup-${Date.now().toString(36)}`,
      supplierName: "סריקה",
      createdAt: Date.now(),
      kind,
      code: "SCAN-1",
      partName: `SCAN-1 · ${KIND_HEBREW[kind]}`,
      widthMm: dims.widthMm,
      heightMm: dims.heightMm,
      depthMm: dims.depthMm,
      profile: profileFor(kind, shape),
      color: "#d8d2c8",
      lathe: measured?.lathe ?? null,
      measurements: measured?.measurements,
      method: measured?.scan?.method,
      capturedAt: new Date().toISOString(),
      device: navigator.userAgent.slice(0, 80),
      referenceObject: measured?.scan?.referenceObject,
      confidence: measured?.scan?.confidence,
      priceValue: Number(price) > 0 ? Number(price) : null,
      currency,
      quotedAt,
    });
    exportGlb({
      kind,
      widthMm: dims.widthMm,
      heightMm: dims.heightMm,
      depthMm: dims.depthMm,
      lathe: measured?.lathe ?? null,
      frames: shots.map((item) => ({ angle: item.angle, width: item.width, height: item.height })),
    });
    setPack(built);
    setPhase("result");
  }

  async function sharePack() {
    if (!pack?.ok) return;
    const file = new File([pack.text], "supplier-pack.json", { type: "application/json" });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      try {
        await nav.share({ files: [file], title: "חבילת ספק" });
        return;
      } catch {
        // The user dismissed the sheet. The download stays available.
      }
    }
    downloadPack(pack.text);
  }

  async function openConfigurator() {
    if (!pack?.ok) return;
    const id = String(pack.pack["id"] ?? "");
    await saveScanPack({ ...pack.pack, id });
    rememberPack(id);
    location.assign(configuratorUrl());
  }

  const plan = capturePlan(kind);
  const shownBand = held ? "held" : band;

  return (
    <main className="scan" data-shot-ready={fixture && shotReady ? "true" : undefined} data-phase={phase}>
      <header>
        <h1>סורק אריזות</h1>
        <span className="mark" aria-hidden="true" />
      </header>
      {phase === "intro" || phase === "error" ? (
        <section className="sheet">
          <p>מודדים אריזה עם כרטיס אשראי כקנה מידה. הכיול נשמר במכשיר.</p>
          {failure ? <p className="error">{FAILURES[failure]}</p> : <p className="muted">המצלמה האחורית נפתחת רק אחרי לחיצה, כפי ש־Safari דורש.</p>}
          <button type="button" onClick={() => void start()}>פתיחת המצלמה</button>
        </section>
      ) : null}
      {phase !== "intro" && phase !== "error" && phase !== "review" && phase !== "result" ? (
        <div className="stage">
          {fixture ? <canvas ref={sceneRef} className="scene" /> : <video ref={videoRef} className="scene" playsInline muted autoPlay />}
          {phase === "distance" || phase === "capture" || (fixture && shot.shot === "distance") ? (
            <div className="hud">
              <strong className={`band-${shownBand}`}>{BAND_TEXT[shownBand]}</strong>
              <em>{distanceCm == null ? "— ס״מ" : `${distanceCm.toFixed(1)} ס״מ`}</em>
              <span>{HINT_TEXT[hint]}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {phase === "calibrate" ? (
        <section className="sheet">
          <p>כיול חד-פעמי. צלמו כרטיס אשראי (85.60×53.98 מ״מ) מ־6 עד 10 זוויות.</p>
          <p>{PROMPTS[Math.min(views.length, PROMPTS.length - 1)]}</p>
          <div className="steps" aria-hidden="true">{PROMPTS.map((_, index) => <i key={index} className={index < (fixture ? 3 : views.length) ? "on" : ""} />)}</div>
          <p className="muted">{fixture ? "3" : views.length} מתוך 8{reprojection != null ? ` · שגיאת הטלה ${reprojection.toFixed(2)} פיקסלים` : ""}</p>
          {note ? <p className="error">{note}</p> : null}
          <button type="button" onClick={takeCalibration}>צילום</button>
          <button type="button" className="ghost" disabled={!fixture && (views.length < 6 || reprojection == null)} onClick={() => finishCalibration()}>שמירת כיול</button>
        </section>
      ) : null}
      {phase === "distance" ? (
        <section className="sheet">
          <label>סוג החלק
            <select value={kind} onChange={(event) => setKind(event.target.value as PartKind)}>
              {(Object.keys(KIND_HEBREW) as PartKind[]).map((item) => <option key={item} value={item}>{KIND_HEBREW[item]}</option>)}
            </select>
          </label>
          <button type="button" disabled={!fixture && band !== "ok" && !held} onClick={() => { setStep(0); setShots([]); setPhase("capture"); }}>המשך לצילום</button>
          <button type="button" className="ghost" onClick={recalibrate}>כיול מחדש</button>
        </section>
      ) : null}
      {phase === "capture" ? (
        <section className="sheet">
          <p>{plan[step] ? `${ANGLE_HEBREW[plan[step].angle]} ${step + 1}/${plan.length}` : ""}</p>
          <p className="muted">הכרטיס נשאר בפריים, ליד החלק.</p>
          {note ? <p className="error">{note}</p> : null}
          <button type="button" onClick={takePart}>צילום</button>
          {plan[step] && !plan[step].required ? <button type="button" className="ghost" onClick={() => (step + 1 >= plan.length ? setPhase("review") : setStep(step + 1))}>דילוג</button> : null}
        </section>
      ) : null}
      {phase === "review" ? (
        <section className="sheet">
          <h2>סקירת צילומים</h2>
          <div className="shots">
            {(fixture ? fixtureShots() : shots).map((item) => (
              <figure key={item.label}>
                {item.thumb ? <img src={item.thumb} alt="" /> : <span className="ph" />}
                <figcaption>{item.label}</figcaption>
              </figure>
            ))}
          </div>
          <button type="button" onClick={() => (fixture ? setPhase("result") : finishReview())}>חישוב מידות</button>
        </section>
      ) : null}
      {phase === "result" ? (
        <ResultSheet
          pack={fixture ? fixturePack(quotedAt) : pack}
          quotedAt={quotedAt}
          price={price}
          currency={currency}
          onPrice={setPrice}
          onCurrency={setCurrency}
          onDownload={() => {
            const ready = fixture ? fixturePack(quotedAt) : pack;
            if (ready?.ok) downloadPack(ready.text);
          }}
          onShare={() => void sharePack()}
          onOpen={() => void openConfigurator()}
        />
      ) : null}
      {phase !== "result" ? null : <p className="muted">ייצוא מודל תלת־ממד אינו חלק מהשלב הזה.</p>}
    </main>
  );
}

function ResultSheet(props: {
  pack: ScanPackResult | null;
  quotedAt: string;
  price: string;
  currency: string;
  onPrice: (value: string) => void;
  onCurrency: (value: string) => void;
  onDownload: () => void;
  onShare: () => void;
  onOpen: () => void;
}) {
  const parts = props.pack?.pack["parts"] as Array<Record<string, number>> | undefined;
  const width = parts?.[0]?.widthMm ?? 40.2;
  const height = parts?.[0]?.heightMm ?? 102.4;
  const depth = parts?.[0]?.depthMm ?? 39.6;
  return (
    <section className="sheet">
      <h2>מידות</h2>
      <div className="dims">
        <div><b>{width}</b>רוחב</div>
        <div><b>{height}</b>גובה</div>
        <div><b>{depth}</b>עומק</div>
      </div>
      <p className="muted">המידות הן הערכה לסקיצה. האימות הסופי מול הספק.</p>
      <label>מחיר ליחידה
        <input inputMode="decimal" value={props.price} onChange={(event) => props.onPrice(event.target.value)} />
      </label>
      <label>מטבע
        <input value={props.currency} onChange={(event) => props.onCurrency(event.target.value.toUpperCase())} />
      </label>
      <p>תאריך הצעה <bdi dir="ltr">{props.quotedAt}</bdi></p>
      {props.pack && !props.pack.ok ? <p className="error">החבילה לא עברה את סכמת הספק, ולכן הייצוא חסום.</p> : null}
      <div className="row">
        <button type="button" disabled={props.pack?.ok === false} onClick={props.onDownload}>הורדה</button>
        <button type="button" className="ghost" disabled={props.pack?.ok === false} onClick={props.onShare}>שיתוף</button>
      </div>
      <button type="button" className="ghost" disabled={props.pack?.ok === false} onClick={props.onOpen}>פתיחה בקונפיגורטור</button>
    </section>
  );
}

function fixturePhase(shot: string): Phase {
  if (shot === "distance") return "distance";
  if (shot === "review") return "review";
  if (shot === "result") return "result";
  return "calibrate";
}

function fixtureBand(shot: ShotView): DistanceBand | "lost" {
  if (shot.state === "close") return "too-close";
  if (shot.state === "far") return "too-far";
  if (shot.state === "held") return "ok";
  return "ok";
}

function fixtureDistance(shot: ShotView): number {
  if (shot.state === "close") return 14.2;
  if (shot.state === "far") return 31.4;
  return 22;
}

function fixtureHint(shot: ShotView): "closer" | "farther" | "hold" | "none" {
  if (shot.state === "close") return "farther";
  if (shot.state === "far") return "closer";
  if (shot.state === "held") return "hold";
  return "none";
}

function fixtureScene(shot: ShotView): "card" | "close" | "ok" | "far" | "held" | "review" | "result" {
  if (shot.shot === "review") return "review";
  if (shot.shot === "result") return "result";
  if (shot.shot === "distance") {
    if (shot.state === "close") return "close";
    if (shot.state === "far") return "far";
    if (shot.state === "held") return "held";
    return "ok";
  }
  return "card";
}

function fixtureShots(): Array<{ label: string; thumb: string }> {
  return [
    { label: "צד", thumb: thumbScene("ok") },
    { label: "למעלה", thumb: thumbScene("card") },
    { label: "למטה", thumb: thumbScene("far") },
  ];
}

function thumbScene(scene: "card" | "close" | "ok" | "far" | "held" | "review" | "result"): string {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 128;
  drawStage(canvas, scene);
  return canvas.toDataURL("image/jpeg", 0.7);
}

function fixturePack(quotedAt: string): ScanPackResult {
  return buildScanPack({
    id: "sup-shot",
    supplierName: "סריקה",
    createdAt: Date.now(),
    kind: "bottle",
    code: "SCAN-1",
    partName: "SCAN-1 · בקבוק",
    widthMm: 40.2,
    heightMm: 102.4,
    depthMm: 39.6,
    profile: "cylinder",
    color: "#d8d2c8",
    capturedAt: new Date().toISOString(),
    confidence: 0.9,
    priceValue: 12.5,
    currency: "ILS",
    quotedAt,
    lathe: Array.from({ length: 42 }, () => 0.95),
  });
}

function profileFor(kind: PartKind, shape: ShapeHint): string {
  if (kind === "label") return "label";
  if (kind === "box") return shape === "cube" ? "cube" : "box";
  if (shape === "taper" || shape === "dome" || shape === "sphere" || shape === "cylinder") return shape;
  return "cylinder";
}

function readFrame(video: HTMLVideoElement, calibration: StoredCalibration | null): { distanceMm: number; tiltDeg: number } | null {
  if (!calibration) return null;
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 640 / video.videoWidth);
  canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const quad = detectCardQuad({ width: canvas.width, height: canvas.height, rgba: image.data });
  if (!quad) return null;
  const sx = canvas.width / calibration.width;
  const sy = canvas.height / calibration.height;
  const camera = {
    fx: calibration.fx * sx,
    fy: calibration.fy * sy,
    cx: calibration.cx * sx,
    cy: calibration.cy * sy,
    k1: calibration.k1,
    k2: calibration.k2,
  };
  const corners = quad.map((point) => undistort(point, camera));
  const pose = estimateCardPose(corners, camera);
  if (!pose) return null;
  return { distanceMm: pose.depthMm, tiltDeg: pose.tiltDegrees };
}

function thumbnail(frame: { width: number; height: number; rgba: Uint8ClampedArray }): string {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const source = document.createElement("canvas");
  source.width = frame.width;
  source.height = frame.height;
  const pixels = new Uint8ClampedArray(frame.rgba.length);
  pixels.set(frame.rgba);
  source.getContext("2d")?.putImageData(new ImageData(pixels, frame.width, frame.height), 0, 0);
  ctx.drawImage(source, 0, 0, 96, 128);
  return canvas.toDataURL("image/jpeg", 0.7);
}

function segmentPart(frame: { width: number; height: number; rgba: Uint8ClampedArray }, card: Vec2[]): Silhouette | null {
  const { width, height, rgba } = frame;
  const pixels = new Uint8Array(width * height);
  let background = 0;
  let count = 0;
  const step = Math.max(1, Math.floor(width / 80));
  for (let x = 0; x < width; x += step) {
    background += rgba[x * 4] + rgba[((height - 1) * width + x) * 4];
    count += 2;
  }
  background /= Math.max(1, count);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (inside(card, x, y)) continue;
      const value = rgba[(y * width + x) * 4];
      if (Math.abs(value - background) > 18) pixels[y * width + x] = 255;
    }
  }
  if (!pixels.some((value) => value !== 0)) return null;
  return silhouette(width, height, pixels);
}

function inside(corners: Vec2[], x: number, y: number): boolean {
  let winding = false;
  for (let index = 0, previous = corners.length - 1; index < corners.length; previous = index, index += 1) {
    const a = corners[index];
    const b = corners[previous];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) winding = !winding;
  }
  return winding;
}

function downloadPack(text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "supplier-pack.json";
  link.click();
  URL.revokeObjectURL(url);
}
