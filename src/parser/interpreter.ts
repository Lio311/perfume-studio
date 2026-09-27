import { interpretUtterance, type InterpretContext, type InterpretResult } from "./interpret.ts";

/**
 * Command interpreter. v1 is local and bilingual — no API key.
 *
 * TODO(llm): Plug an LLM backend by implementing CommandInterpreter and calling
 * it from interpretCommand before the rule fallback. Send the utterance, a
 * compact catalog (ids, names, neck standards), and the current design. Map
 * the model JSON back into LabCommand[]. Keep interpretUtterance as the
 * offline fallback when the request fails or no endpoint is configured.
 */
export interface CommandInterpreter {
  interpret(utterance: string, ctx: InterpretContext): Promise<InterpretResult> | InterpretResult;
}

export const ruleInterpreter: CommandInterpreter = {
  interpret(utterance, ctx) {
    return interpretUtterance(utterance, ctx);
  },
};

export async function interpretCommand(utterance: string, ctx: InterpretContext): Promise<InterpretResult> {
  return ruleInterpreter.interpret(utterance, ctx);
}
