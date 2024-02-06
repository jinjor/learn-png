import React, { useCallback } from "react";
import { SyncParseOptions, parse } from "../lib/sync";
import { requestPixelStream } from "../lib/stream";

export const App = () => {
  const images = [
    "./assets/sd.png",
    "./assets/sd_x.png",
    "./assets/mac_ss.png",
    "./assets/mac_ss_large.png",
    "./assets/mac_ss_large_interlace.png",
  ];
  const [selected, setSelected] = React.useState(images[0]);
  return (
    <>
      <select onChange={(e) => setSelected(e.target.value)}>
        {images.map((imagePath, i) => (
          <option key={i}>{imagePath}</option>
        ))}
      </select>
      <hr></hr>
      <Item key={selected} imagePath={selected} />
    </>
  );
};

const Item = ({ imagePath }: { imagePath: string }) => {
  const canvasContainerRef = React.useRef<HTMLDivElement>(null);
  const [log, setLog] = React.useState<string[]>([]);
  const [filterType, setFilterType] = React.useState(0);

  const reset = () => {
    setLog([]);
    const container = canvasContainerRef.current!;
    container.innerHTML = "";
    return container;
  };

  const appendLog = useCallback((s: string) => {
    setLog((prev) => [...prev, s]);
  }, []);

  const handleClickRead = async (options?: SyncParseOptions) => {
    const container = reset();
    const src = imagePath + "?" + Date.now();
    const start = Date.now();
    await fetchAndDrawSync(src, container, appendLog, options);
    console.log("time1:", Date.now() - start);
  };

  const handleClickReadStream = async () => {
    const container = reset();
    const src = imagePath + "?" + Date.now();
    const start = Date.now();
    await fetchAndDrawStream(src, container, appendLog);
    console.log("time2:", Date.now() - start);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterType(parseInt(e.target.value));
  };

  return (
    <div style={{ display: "flex", gap: 30 }}>
      <div style={{ width: 400, flexShrink: 0 }}>
        <img src={imagePath} style={{ width: "100%" }} />
        <ul
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginTop: 20,
          }}
        >
          <li>
            <button onClick={() => handleClickRead()}>Read (sync)</button>
          </li>
          <li>
            <button onClick={handleClickReadStream}>Read (stream)</button>
          </li>
          <li style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => handleClickRead({ forceFilterType: filterType })}
            >
              Read (forced filter)
            </button>
            <input
              type="number"
              min={0}
              max={4}
              onInput={handleInput}
              value={filterType}
            ></input>
          </li>
        </ul>
      </div>
      <div style={{ flexGrow: 1 }}>
        <div style={{ position: "relative", marginBottom: 20 }}>
          <img
            src={imagePath}
            style={{ width: "100%", visibility: "hidden" }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "100%",
              backgroundColor: "#eee",
            }}
            ref={canvasContainerRef}
          ></div>
        </div>
        <pre>{log.length ? log.join("\n") : "(No log)"}</pre>
      </div>
    </div>
  );
};

const createNewCanvas = (container: HTMLDivElement) => {
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  container.appendChild(canvas);
  return canvas;
};

const fetchAndDrawSync = async (
  src: string,
  container: HTMLDivElement,
  log: (s: string) => void,
  options?: SyncParseOptions
) => {
  log("started");
  const res = await fetch(src);
  const binary = await res.arrayBuffer();
  const { pixels } = await parse(binary, options);
  const width = pixels[0].length;
  const height = pixels.length;
  const canvas = createNewCanvas(container);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < height; y++) {
    const row = pixels[y];
    for (let x = 0; x < width; x++) {
      const pixel = row[x];
      const color = `rgb(${pixel.r}, ${pixel.g}, ${pixel.b})`;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  log("done");
};

const fetchAndDrawStream = async (
  src: string,
  container: HTMLDivElement,
  log: (s: string) => void
) => {
  log("started");
  const res = await fetch(src);
  const { head, body } = await requestPixelStream(bufferStream(res.body!));
  const canvas = createNewCanvas(container);
  canvas.width = head.width;
  canvas.height = head.height;
  const ctx = canvas.getContext("2d")!;
  for await (const { pixels, interpolation } of body) {
    for (const { x, y, color } of pixels) {
      ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
      ctx.fillRect(x, y, interpolation?.spanX ?? 1, interpolation?.spanY ?? 1);
    }
  }
  log("done");
};
async function* bufferStream(stream: ReadableStream<Uint8Array>) {
  // const reader = new ReadableStream<Uint8Array>(
  //   stream,
  //   new ByteLengthQueuingStrategy({
  //     highWaterMark: 1 * 1024,
  //   })
  // ).getReader();
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    yield value;
  }
}
