#!/usr/bin/env node
import { createProgram, defaultDeps } from "./program.js";

process.exitCode = await createProgram(defaultDeps()).run(process.argv.slice(2));
