import fs from "node:fs";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import type { ForgePersistedState } from "../domain/forge.models";

@Injectable()
export class ForgeStateRepository {
  private readonly stateFilePath = this.resolveStateFilePath();

  load(initialFactory: () => ForgePersistedState): ForgePersistedState {
    const existing = this.readStateFromDisk();
    if (existing) {
      return existing;
    }

    const initialState = initialFactory();
    this.save(initialState);
    return initialState;
  }

  save(state: ForgePersistedState): void {
    const parentDir = path.dirname(this.stateFilePath);
    fs.mkdirSync(parentDir, { recursive: true });
    fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), "utf8");
  }

  private readStateFromDisk(): ForgePersistedState | null {
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        return null;
      }

      const raw = fs.readFileSync(this.stateFilePath, "utf8");
      return JSON.parse(raw) as ForgePersistedState;
    } catch {
      return null;
    }
  }

  private resolveStateFilePath(): string {
    return (
      process.env["FORGE_STATE_FILE"] ||
      path.join(process.cwd(), "tmp", "cosmic-forge-state", "forge-state.json")
    );
  }
}
