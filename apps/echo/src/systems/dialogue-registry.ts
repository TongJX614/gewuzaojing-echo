import type { DialogueTree } from '../data/dialogues';
import { ALL_DIALOGUES } from '../data/dialogues';

export interface DialogueCandidate {
  tree: DialogueTree;
  score: number;
}

export class DialogueRegistry {
  private dialogues = new Map<string, DialogueTree>();
  private originalIds = new Set<string>();

  constructor() {
    for (const tree of ALL_DIALOGUES) {
      this.dialogues.set(tree.id, tree);
      this.originalIds.add(tree.id);
    }
  }

  register(tree: DialogueTree): void {
    if (this.dialogues.has(tree.id)) {
      console.warn(`[DialogueRegistry] Overwriting existing dialogue: ${tree.id}`);
    }
    this.dialogues.set(tree.id, { ...tree });
  }

  update(id: string, patch: Partial<DialogueTree>): boolean {
    const existing = this.dialogues.get(id);
    if (!existing) return false;
    this.dialogues.set(id, { ...existing, ...patch });
    return true;
  }

  remove(id: string): boolean {
    return this.dialogues.delete(id);
  }

  get(id: string): DialogueTree | undefined {
    return this.dialogues.get(id);
  }

  has(id: string): boolean {
    return this.dialogues.has(id);
  }

  list(): DialogueTree[] {
    return Array.from(this.dialogues.values());
  }

  listIds(): string[] {
    return Array.from(this.dialogues.keys());
  }

  isOriginal(id: string): boolean {
    return this.originalIds.has(id);
  }

  getAll(): DialogueTree[] {
    return Array.from(this.dialogues.values());
  }

  findCandidates(
    scene: string,
    trigger: string,
    options: {
      currentStage?: string;
      checkCondition?: (tree: DialogueTree) => boolean;
    } = {},
  ): DialogueTree[] {
    const { currentStage, checkCondition } = options;
    let candidates = this.list().filter(
      (d) => d.scene === scene && d.trigger === trigger,
    );

    candidates = candidates.filter((tree) => {
      if (tree.stage && currentStage && tree.stage !== currentStage) {
        return false;
      }
      if (checkCondition && !checkCondition(tree)) {
        return false;
      }
      return true;
    });

    candidates.sort((a, b) => {
      const aHasCond = !!(a.condition && a.condition.length);
      const bHasCond = !!(b.condition && b.condition.length);
      if (aHasCond && !bHasCond) return -1;
      if (!aHasCond && bHasCond) return 1;
      return (b.priority ?? 0) - (a.priority ?? 0);
    });

    return candidates;
  }

  resolve(
    scene: string,
    trigger: string,
    options: {
      currentStage?: string;
      checkCondition?: (tree: DialogueTree) => boolean;
    } = {},
  ): DialogueTree | undefined {
    const candidates = this.findCandidates(scene, trigger, options);
    if (candidates.length === 0) return undefined;

    const first = candidates[0];
    if (first.condition && first.condition.length > 0) return first;
    if (candidates.length === 1) return first;

    return candidates.find((c) => !c.condition || c.condition.length === 0) ?? first;
  }

  applyData(data: Record<string, DialogueTree>): void {
    const newIds = new Set(Object.keys(data));
    for (const existingId of this.dialogues.keys()) {
      if (!this.originalIds.has(existingId) && !newIds.has(existingId)) {
        this.dialogues.delete(existingId);
      }
    }
    for (const [id, tree] of Object.entries(data)) {
      this.dialogues.set(id, { ...tree });
    }
  }

  summaries() {
    return this.list().map((t) => ({
      id: t.id,
      scene: t.scene,
      trigger: t.trigger,
      eventType: t.eventType,
      cgUrl: t.cgUrl,
      stage: t.stage,
      condition: t.condition,
      priority: t.priority,
      nodeCount: t.nodes.length,
      preview: t.nodes[t.startNode]?.lines[0]?.text ?? '(empty)',
    }));
  }
}
