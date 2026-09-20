import net from "node:net";

function command(value: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: 1234 });
    let output = "";
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (error) reject(error); else resolve(output.split(/\r?\nEND/)[0].trim());
    };
    socket.setTimeout(4000, () => finish(new Error("RADIO_TIMEOUT")));
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(value + "\n"));
    socket.on("data", chunk => {
      output += chunk;
      if (/(?:^|\n)END\r?\n/.test(output)) finish();
      else if (output.length > 4096) finish(new Error("RADIO_BAD_RESPONSE"));
    });
    socket.on("error", finish);
    socket.on("close", () => { if (!done) finish(new Error("RADIO_CLOSED")); });
  });
}

export async function radioVolume(volume?: number): Promise<number> {
  if (volume !== undefined) {
    if (!Number.isInteger(volume) || volume < 0 || volume > 100) throw new Error("INVALID_VOLUME");
    const result = await command(`var.set roomwave_volume = ${(volume / 100).toFixed(2)}`);
    if (/error|unknown|not found/i.test(result)) throw new Error("RADIO_SET_FAILED");
  }
  const result = await command("var.get roomwave_volume");
  const value = Number(result);
  if (!result || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("RADIO_BAD_VOLUME");
  return Math.round(value * 100);
}
