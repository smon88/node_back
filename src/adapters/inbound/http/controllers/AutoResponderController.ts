import { type Request, type Response } from "express";
import type { AutoResponderOrchestrator } from "../../../../core/application/usecases/autoResponder/AutoResponderOrchestrator.js";
import type { SocketIoGateway } from "../../../outbound/realtime/SocketIoGateway.js";

export class AutoResponderController {
  constructor(
    private orchestrator: AutoResponderOrchestrator,
    private rt: SocketIoGateway,
    private sharedSecret: string,
  ) {}

  getConfig = async (req: Request, res: Response) => {
    if (req.header("X-SHARED-SECRET") !== this.sharedSecret) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const config = this.orchestrator.getConfig();
    res.json(config);
  };

  updateConfig = async (req: Request, res: Response) => {
    if (req.header("X-SHARED-SECRET") !== this.sharedSecret) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const { enabled, timeout, actions } = req.body;

    const patch: Record<string, unknown> = {};
    if (typeof enabled === "boolean") patch.enabled = enabled;
    if (typeof timeout === "number" && timeout >= 5 && timeout <= 120)
      patch.timeout = timeout;
    if (actions && typeof actions === "object") patch.actions = actions;

    const updated = await this.orchestrator.updateConfig(patch);

    // Broadcast updated config to all connected admins
    this.rt.emitAutoResponderConfig(updated);

    res.json(updated);
  };
}
