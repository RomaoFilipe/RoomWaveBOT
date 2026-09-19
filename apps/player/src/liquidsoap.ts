import net from "node:net";

const HOST =
  process.env.LIQUIDSOAP_HOST ??
  "127.0.0.1";

const PORT =
  Number(
    process.env.LIQUIDSOAP_PORT ??
    1234,
  );

const QUEUE =
  process.env.LIQUIDSOAP_QUEUE ??
  "roomwave_queue";

export async function liquidsoapCommand(
  command: string,
): Promise<string> {
  return new Promise(
    (resolve, reject) => {
      const socket =
        net.createConnection({
          host: HOST,
          port: PORT,
        });

      let output = "";

      const timer =
        setTimeout(() => {
          socket.destroy();

          reject(
            new Error(
              `Liquidsoap timeout: ${command}`,
            ),
          );
        }, 5000);

      socket.setEncoding("utf8");

      socket.on(
        "connect",
        () => {
          socket.write(
            `${command}\n`,
          );
        },
      );

      socket.on(
        "data",
        (data) => {
          output += data;

          if (
            output.includes(
              "END",
            )
          ) {
            clearTimeout(
              timer,
            );

            socket.end();

            resolve(
              output.trim(),
            );
          }
        },
      );

      socket.on(
        "error",
        (error) => {
          clearTimeout(
            timer,
          );

          reject(error);
        },
      );

      socket.on(
        "close",
        () => {
          clearTimeout(
            timer,
          );

          if (
            output &&
            !output.includes(
              "END",
            )
          ) {
            resolve(
              output.trim(),
            );
          }
        },
      );
    },
  );
}

export async function radioPush(
  uri: string,
) {
  const result =
    await liquidsoapCommand(
      `${QUEUE}.push ${uri}`,
    );

  console.log(
    `📻 Liquidsoap PUSH: ${uri}`,
  );

  return result;
}

export async function radioSkip() {
  console.log(
    "⏭️ Liquidsoap SKIP",
  );

  return liquidsoapCommand(
    `${QUEUE}.skip`,
  );
}

export async function radioQueue() {
  return liquidsoapCommand(
    `${QUEUE}.queue`,
  );
}
