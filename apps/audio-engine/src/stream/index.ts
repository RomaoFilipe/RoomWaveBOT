import type {
  IncomingMessage,
  ServerResponse
} from "node:http";

export class StreamHub {

  private readonly clients =
    new Set<ServerResponse>();

  attach(
    req: IncomingMessage,
    res: ServerResponse
  ): void {

    res.writeHead(
      200,
      {
        "Content-Type":
          "audio/mpeg",

        "Cache-Control":
          "no-cache, no-store, must-revalidate",

        "Pragma":
          "no-cache",

        "Connection":
          "keep-alive",

        "Access-Control-Allow-Origin":
          "*"
      }
    );

    this.clients.add(res);

    console.log(
      `🎧 Listener connected (${this.clients.size})`
    );

    const remove = () => {

      if (
        this.clients.delete(res)
      ) {
        console.log(
          `🎧 Listener disconnected (${this.clients.size})`
        );
      }
    };

    req.once(
      "close",
      remove
    );

    res.once(
      "close",
      remove
    );
  }

  broadcast(
    chunk: Buffer
  ): void {

    for (
      const client of this.clients
    ) {

      if (
        client.destroyed ||
        client.writableEnded
      ) {

        this.clients.delete(
          client
        );

        continue;
      }

      try {

        client.write(
          chunk
        );

      } catch {

        this.clients.delete(
          client
        );
      }
    }
  }

  clearRing(): void {
    /*
     * Kept for API compatibility.
     * No historical audio is retained.
     */
  }

  get listenerCount():
    number {

    return this.clients.size;
  }
}
