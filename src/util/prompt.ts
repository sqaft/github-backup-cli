import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { CliError, ExitCode } from "./errors.js";

/** Questions for the person at the terminal. Output goes to stderr; stdout stays machine-readable. */
export interface Prompter {
  say(line: string): void;
  /** Resolves with the trimmed answer. Rejects with a `CliError` when the person cancels. */
  ask(question: string, options?: { hidden?: boolean }): Promise<string>;
  close(): void;
}

export interface TextQuestion {
  defaultValue?: string;
  /** Hides the answer while typing. */
  hidden?: boolean;
  /** Returns the reason an answer is rejected, or undefined to accept it. */
  validate?: (answer: string) => string | undefined;
}

/** Repeats the question until it gets a usable answer. */
export async function askText(
  prompter: Prompter,
  label: string,
  question: TextQuestion = {},
): Promise<string> {
  const { defaultValue, hidden, validate } = question;
  const suffix = defaultValue === undefined ? ": " : ` [${defaultValue}]: `;
  for (;;) {
    const answer = (await prompter.ask(`${label}${suffix}`, { hidden })) || defaultValue;
    if (answer === undefined) {
      prompter.say("  A value is required.");
      continue;
    }
    const problem = validate?.(answer);
    if (problem === undefined) return answer;
    prompter.say(`  ${problem}`);
  }
}

export async function askYesNo(
  prompter: Prompter,
  label: string,
  defaultValue: boolean,
): Promise<boolean> {
  const hint = defaultValue ? "Y/n" : "y/N";
  for (;;) {
    const answer = (await prompter.ask(`${label} [${hint}]: `)).toLowerCase();
    if (answer === "") return defaultValue;
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    prompter.say("  Answer y or n.");
  }
}

/** Numbered menu; the first choice is the default. */
export async function askChoice<T>(
  prompter: Prompter,
  label: string,
  choices: ReadonlyArray<{ label: string; value: T }>,
): Promise<T> {
  prompter.say(`${label}:`);
  choices.forEach((choice, index) => {
    prompter.say(`  ${index + 1}) ${choice.label}`);
  });
  const answer = await askText(prompter, "Choose", {
    defaultValue: "1",
    validate: (value) =>
      choices[Number(value) - 1] === undefined
        ? `Enter a number from 1 to ${choices.length}.`
        : undefined,
  });
  return (choices[Number(answer) - 1] as { value: T }).value;
}

/** Ctrl-C and Ctrl-D close the readline interface, which cancels the pending question. */
export function createTerminalPrompter(): Prompter {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!muted) process.stderr.write(chunk, encoding);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });

  return {
    say(line) {
      process.stderr.write(`${line}\n`);
    },
    ask(question, options = {}) {
      const hidden = options.hidden === true;
      return new Promise((resolve, reject) => {
        const onClose = () => {
          muted = false;
          process.stderr.write("\n");
          reject(new CliError("setup cancelled; nothing was saved", ExitCode.Interrupted));
        };
        rl.once("close", onClose);
        if (hidden) process.stderr.write(question);
        muted = hidden;
        rl.question(hidden ? "" : question, (answer) => {
          rl.off("close", onClose);
          muted = false;
          if (hidden) process.stderr.write("\n");
          resolve(answer.trim());
        });
      });
    },
    close() {
      rl.close();
    },
  };
}
