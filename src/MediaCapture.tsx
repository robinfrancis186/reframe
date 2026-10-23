import { useEffect, useRef, useState } from 'react';
import { Camera, Film, ImagePlus, X, Circle, Square } from 'lucide-react';
export interface Frame {
  image: string;
  time: number;
}
export default function MediaCapture({
  mode,
  frames,
  onFrames,
  disabled,
}: {
  mode: string;
  frames: Frame[];
  onFrames: (frames: Frame[]) => void;
  disabled: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  function stop() {
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, []);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  function frame(source: CanvasImageSource, width: number, height: number, time = 0) {
    if (!width || !height) throw new Error('Wait until the media has loaded.');
    const canvas = document.createElement('canvas'),
      ratio = Math.min(1, 1280 / Math.max(width, height));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
    return { image: canvas.toDataURL('image/jpeg', 0.82), time: Math.round(time * 10) / 10 };
  }
  async function upload(file?: File) {
    if (!file) return;
    setError('');
    try {
      if (file.size > (mode === 'image' ? 5_000_000 : 100_000_000))
        throw new Error(
          mode === 'image' ? 'Choose an image under 5 MB.' : 'Choose a video under 100 MB.',
        );
      if (mode === 'image') {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
          throw new Error('Choose PNG, JPEG or WebP.');
        const bitmap = await createImageBitmap(file);
        const selected = frame(bitmap, bitmap.width, bitmap.height);
        bitmap.close();
        if (alive.current) {
          onFrames([selected]);
          setName(file.name);
        }
      } else {
        if (!file.type.startsWith('video/'))
          throw new Error('Choose a browser-playable video file.');
        stop();
        setLive(false);
        setReady(false);
        onFrames([]);
        if (video.current) video.current.srcObject = null;
        setUrl(URL.createObjectURL(file));
        setName(file.name);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function camera() {
    setStarting(true);
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Camera requires a supported browser on localhost or HTTPS.');
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      if (!alive.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      setUrl('');
      setLive(true);
      setReady(false);
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
    } catch (e) {
      stop();
      if (alive.current) {
        setLive(false);
        setError(
          `Camera unavailable: ${(e as Error).message}. You can upload a screenshot or video instead.`,
        );
      }
    } finally {
      if (alive.current) setStarting(false);
    }
  }
  function snapshot() {
    try {
      if (!video.current || frames.length >= 6) return;
      onFrames([
        ...frames,
        frame(
          video.current,
          video.current.videoWidth,
          video.current.videoHeight,
          video.current.currentTime,
        ),
      ]);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function record() {
    if (!stream.current) return;
    setError('');
    try {
      if (!window.MediaRecorder)
        throw new Error('Recording is unavailable in this browser. Capture frames instead.');
      const recording = new MediaRecorder(stream.current),
        chunks: Blob[] = [];
      recorder.current = recording;
      let bytes = 0;
      recording.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          bytes += e.data.size;
        }
        if (bytes > 100_000_000 && recording.state === 'recording') recording.stop();
      };
      recording.onerror = () => {
        stop();
        if (alive.current) {
          setRecording(false);
          setLive(false);
          setError('Recording failed. Please try uploading a video.');
        }
      };
      recording.onstop = () => {
        if (timer.current) clearTimeout(timer.current);
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        if (!alive.current) return;
        if (video.current) video.current.srcObject = null;
        setRecording(false);
        setLive(false);
        setReady(false);
        setUrl(URL.createObjectURL(new Blob(chunks, { type: recording.mimeType })));
        setName('Camera recording');
        onFrames([]);
      };
      recording.start(1000);
      setRecording(true);
      timer.current = setTimeout(() => {
        if (recording.state === 'recording') recording.stop();
      }, 60_000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="media-capture">
      <p className="notice">
        {mode === 'image'
          ? 'Choose a screenshot from any app. Select the component to rebuild in the instructions below.'
          : 'Review the video and capture up to six frames that show the component and its different states. Only selected frames are sent for reconstruction.'}
      </p>
      <div className="media-actions">
        <label
          className="media-upload"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!disabled) void upload(e.dataTransfer.files[0]);
          }}
        >
          {mode === 'image' ? <ImagePlus size={18} /> : <Film size={18} />}
          {name || (mode === 'image' ? 'Choose or drop a screenshot' : 'Choose or drop a video')}
          <input
            aria-label="Upload reference media"
            type="file"
            disabled={disabled || live || starting}
            accept={mode === 'image' ? 'image/png,image/jpeg,image/webp' : 'video/*'}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
        {mode === 'camera' && !live && (
          <button disabled={disabled || starting} onClick={() => void camera()}>
            <Camera size={16} />
            {starting ? 'Opening camera…' : 'Start camera'}
          </button>
        )}
      </div>
      {mode !== 'image' && (
        <>
          <div className={'media-player ' + (!url && !live ? 'empty' : '')}>
            <video
              ref={video}
              src={url || undefined}
              controls={!live}
              muted
              playsInline
              onLoadedData={() => setReady(true)}
              onError={() => {
                setReady(false);
                setError('This video cannot be played. Try an MP4 (H.264) or WebM file.');
              }}
            />
            {!url && !live && (
              <p>
                <Film size={28} />
                Your reference video appears here
              </p>
            )}
          </div>
          {(live || url) && (
            <div className="media-controls">
              <button
                disabled={disabled || !ready || frames.length >= 6 || recording}
                onClick={snapshot}
              >
                <Camera size={16} />
                Capture this frame
              </button>
              {live && (
                <>
                  <button
                    disabled={disabled || !ready}
                    onClick={() => (recording ? recorder.current?.stop() : record())}
                  >
                    {recording ? <Square size={14} /> : <Circle size={14} />}{' '}
                    {recording ? 'Stop recording' : 'Record up to 60 seconds'}
                  </button>
                  {!recording && (
                    <button
                      onClick={() => {
                        stop();
                        setLive(false);
                        setReady(false);
                        if (video.current) video.current.srcObject = null;
                      }}
                    >
                      Turn camera off
                    </button>
                  )}
                </>
              )}
              {recording && (
                <span role="status" className="recording-indicator">
                  Recording · camera on
                </span>
              )}
            </div>
          )}
        </>
      )}
      {!!frames.length && (
        <div
          className={'frame-strip ' + (mode === 'image' ? 'single-frame' : '')}
          aria-label="Selected frames"
        >
          {frames.map((f, i) => (
            <figure key={i}>
              <img src={f.image} alt={`Selected frame ${i + 1}`} />
              <figcaption>
                {mode === 'image' ? 'Screenshot ready' : `Frame ${i + 1} · ${f.time.toFixed(1)}s`}
                <button
                  disabled={disabled}
                  aria-label={`Remove frame ${i + 1}`}
                  onClick={() => onFrames(frames.filter((_, n) => n !== i))}
                >
                  <X size={14} />
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <small className="muted">
        Media stays in this browser until you choose Reconstruct. Audio is not recorded or uploaded.
      </small>
    </div>
  );
}
