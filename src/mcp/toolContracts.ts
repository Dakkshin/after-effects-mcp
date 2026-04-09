export type ToolServer = {
  tool: (...args: any[]) => unknown;
  prompt: (...args: any[]) => unknown;
  resource: (...args: any[]) => unknown;
};

export type BridgeExecutionResult = {
  ok: boolean;
  result: any;
  retries: number;
  failureClass?: string;
};

export type QueueBridgeCommand = (command: string, args?: Record<string, any>) => Promise<string>;

export type WaitForBridgeResult = (
  options?: { expectedCommand?: string; expectedCommandId?: string; timeoutMs?: number; pollMs?: number }
) => Promise<string>;

export type ExecuteBridgeCommandAndWait = (
  command: string,
  args: Record<string, any>,
  options?: { timeoutMs?: number; maxAttempts?: number }
) => Promise<BridgeExecutionResult>;

export type ExecuteCommandThroughSafety = (
  command: string,
  args: Record<string, any>,
  options: { timeoutMs?: number; allowForceWithoutCheckpoint?: boolean } | undefined,
  dependencies: SafetyRoutingDependencies
) => Promise<BridgeExecutionResult>;

export type ExecuteCommandThroughSafetyBound = (
  command: string,
  args: Record<string, any>,
  options?: { timeoutMs?: number; allowForceWithoutCheckpoint?: boolean }
) => Promise<BridgeExecutionResult>;

export type QueueMutationWithSafety = (
  command: string,
  args: Record<string, any> | undefined,
  options: { allowForceWithoutCheckpoint?: boolean } | undefined,
  dependencies: Pick<SafetyRoutingDependencies, "queueBridgeCommand" | "executeBridgeCommandAndWait">
) => Promise<Record<string, unknown>>;

export type SafetyRoutingDependencies = {
  queueBridgeCommand: QueueBridgeCommand;
  waitForBridgeResult: WaitForBridgeResult;
  executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait;
};

export type BuildQueuedBridgeToolResponse = (command: string, commandId: string, detail?: string) => any;

export type FormatToolPayload = (payload: Record<string, unknown>, isError?: boolean) => any;
