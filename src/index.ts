/// # spawn2
///
/// <code>const { communicate, execute, spawn, wait } = require('spawn2');</code>
///
/// Like the NodeJS `child_process` module, this module provides the ability to spawn children processes.
/// In addition to a `spawn()` function very similar to the NodeJS one, it also provides an higher level interface for more common tasks.
///
/// Main differences with `child_process` are:
///  * The IPC interface (`subprocess.send` and `process.on("message")`) are not provided
///  * Higer level API, based on promises
///  * `exitCode` and `signalCode` are exposed. With `child_process`, if `.on("exit")` is called after the process has exited,
///    the callback will never be called. Exposing `exitCode` and `signalCode` escapes this pitfall.
///  * More convenient stdio management in common cases (reading or writing `Buffer`/`string`)
///  * More convenient `exitCode`/`signalCode` in common cases (throws an error in case of a non-zero exit code/non-null signal code)
///  * Allows you to use child processes as stream `Transform` (for stream `pipe`/`pipeline`) (see: `makePipe`)

import child_process from "child_process";
import stream from "stream";
import { promisify } from "util";

import getStream from "get-stream";
import intoStream from "into-stream";

///
/// ## class ChildProcessError
///
/// Thrown by `wait()`, `communicate()` and `execute()` when:
///  * the exit code is not zero, and `checkExitCode` is `true`, or
///  * the status code is not null, and `checkStatusCode` is `true`
///
/// @doc-start-code
export class ChildProcessError extends Error {
	public childProcess: ChildProcess;
/// }
/// @doc-end-code

	constructor(childProcess: ChildProcess) {
		super(
			childProcess.exitCode ? `Command ${childProcess.command[0]} failed with exit code ${childProcess.exitCode}` :
			childProcess.signalCode ? `Command ${childProcess.command[0]} failed with signal ${childProcess.signalCode}` :
			`Command ${childProcess.command[0]} failed`,
		);
		this.childProcess = childProcess;
	}
}

///
/// ## interface SpawnOptions
///
/// Options when spawning a new processes. They are the same as `child_process`, but with some additions.
///
/// @doc-start-code
export interface SpawnOptions extends child_process.SpawnOptions {
	// Encoding to use for decoding stdout/stderr for `execute()` and `communicate()`
	// `null` means not to try to decoding and returning a Buffer instead of a string.
	// Default: 'utf-8'.
	encoding?: BufferEncoding | null;

	// Instructs `wait()`, `communicate()` and `execute()` to check that exit code is zero (success), and to throw an error if it isn't.
	// Default: `true`
	checkExitCode?: boolean;

	// Instructs `wait()`, `communicate()` and `execute()` to check that status code is null, and to throw an error if it isn't.
	// Default: `true`
	checkSignalCode?: boolean;

	// Instructs `communicate()` and `execute()` to trim stdout/stderr.
	// Default: `true`.
	trimOutput?: boolean;
}
/// @doc-end-code

///
/// ## interface ChildProcess
///
/// Similar to `child_process.ChildProcess`, it is returned by `spawn()` on success.
///
/// @doc-start-code
export interface ChildProcess {
	// The command that has been used to spawn this process
	command: string[];

	// The options that have been used by `spawn()`, after setting default options
	options: SpawnOptions;

	// The exit code of the process. It is only non-null when the process has been terminated and has not been signaled.
	exitCode: number | null;

	// The signal code of the process. It is only non-null when the process has been terminated and has been signaled.
	signalCode: string | null;

	// pid of the process. The value is not unset after the process has been terminated.
	pid: number;

	// True while the process has not been terminated
	isAlive: boolean;

	// Same as in `child_process`
	stdin: stream.Writable | null;
	stdout: stream.Readable | null;
	stderr: stream.Readable | null;
	_cp: child_process.ChildProcess; /// @doc-ignore
}
/// @doc-end-code

///
/// ## function spawn
///
/// <code>function spawn(command: string|string[], options?: SpawnOptions): ChildProcess</code>
///
/// Spawn a new process. The executable is `command[0]`, the rest of the array is used to provide arguments.
/// If `command` is a string, it will be assumed to be a shell command to be interpreted by `/bin/sh`.
///
/// Example:
///
/// <code>spawn(["cat", "/etc/fstab"])</code>
export function spawn(command: string | string[], options?: SpawnOptions & { encoding?: BufferEncoding }):
	ChildProcess & { options: { encoding: BufferEncoding } };
export function spawn(command: string | string[], options: SpawnOptions & { encoding: null }):
	ChildProcess & { options: { encoding: null } };
export function spawn(command: any, options?: any): any {
	const defaultOptions = {
		checkExitCode: true,
		checkSignalCode: true,
		encoding: "utf-8",
		trimOutput: !!(options && options.encoding !== null),
	};
	const commandArray = Array.isArray(command) ? command : ["/bin/sh", "-c", command];
	const mergedOptions = { ...defaultOptions, ...(options || {}) };
	const nodeCp = child_process.spawn(commandArray[0], commandArray.slice(1), mergedOptions);
	const cp = {
		_cp: nodeCp,
		command: commandArray,
		exitCode: null as number | null,
		isAlive: true,
		options: mergedOptions,
		pid: nodeCp.pid,
		signalCode: null as string | null,
		stderr: nodeCp.stderr,
		stdin: nodeCp.stdin,
		stdout: nodeCp.stdout,
	};
	cp._cp.on("exit", (exitCode, signalCode) => {
		cp.isAlive = false;
		cp.exitCode = exitCode;
		cp.signalCode = signalCode;
	});
	return cp;
}

/// ## function wait
///
/// <code>function wait(cp: ChildProcess): Promise\<{ exitCode: number | null, signalCode: string | null }\></code>
///
/// Wait for the process to terminate, and returns the exit code and signal code.
/// Note that this may throws an error instead of returning if `checkExitCode` or `checkStatusCode` is true.
export async function wait(cp: ChildProcess): Promise<{ exitCode: number | null, signalCode: string | null }> {
	return new Promise((resolve, reject) => {
		const cb = (exitCode: number | null, signalCode: string | null) => {
			if((exitCode && cp.options.checkExitCode) || (signalCode && cp.options.checkSignalCode)) {
				reject(new ChildProcessError(cp));
			} else {
				resolve({ exitCode, signalCode });
			}
		};
		if(cp.isAlive) {
			cp._cp.on("exit", cb);
		} else {
			cb(cp.exitCode, cp.signalCode);
		}
	});
}

function maybeTrim(s: Buffer | string | null, cp: ChildProcess): Buffer | string | null {
	if(typeof s === "string" && cp.options.trimOutput) {
		return s.trim();
	} else {
		return s;
	}
}

///
/// ## function communicate
///
/// <code>function communicate(cp: ChildProcess, stdin?: intoStream.Input | RedableStream): Promise\<{ stdout: Buffer | string | null, stderr: Buffer | string | null, exitCode: number | null, signalCode: string | null }\></code>
///
/// Sends stdin to a running process, reads stdout and stderr and waits for the process to terminate.
/// The return type of stdout and stderr is determined by the `encoding` option.
export async function communicate(cp: (ChildProcess & { options: { encoding: null }}), stdin?: intoStream.Input | NodeJS.ReadableStream):
	Promise<{ stdout: Buffer | null, stderr: Buffer | null, exitCode: number | null, signalCode: string | null }>;
export async function communicate(cp: (ChildProcess & { options: { encoding: BufferEncoding }}), stdin?: intoStream.Input | NodeJS.ReadableStream):
	Promise<{ stdout: string | null, stderr: string | null, exitCode: number | null, signalCode: string | null }>;
export async function communicate(cp: any, stdin: any): Promise<any> {
	if((stdin === undefined || stdin === null) && cp.stdin !== null) {
		cp.stdin.end();
	}

	let stdinPromise: Promise<void>;
	if(stdin === null || stdin === undefined || cp.stdin === null) {
		stdinPromise = Promise.resolve();
	} else {
		stdinPromise = promisify(stream.pipeline)((typeof stdin.pipe === "function" ? stdin : intoStream(stdin)), cp.stdin);
	}

	const stdoutPromise: Promise<null | string | Buffer> =
		cp.stdout === null ? Promise.resolve(null) :
		cp.options.encoding ? getStream(cp.stdout, { encoding: cp.options.encoding }) :
		getStream.buffer(cp.stdout);

	const stderrPromise: Promise<null | string | Buffer> =
		cp.stderr === null ? Promise.resolve(null) :
		cp.options.encoding ? getStream(cp.stderr, { encoding: cp.options.encoding }) :
		getStream.buffer(cp.stderr);

	const [ _, codes, stdout, stderr ] = await Promise.all([stdinPromise, wait(cp), stdoutPromise, stderrPromise]);

	return { stdout: maybeTrim(stdout, cp), stderr: maybeTrim(stderr, cp), ...codes };
}

///
/// ## interface ExecuteOptions
///
/// Additional options for `execute()`
///
/// @doc-start-code
export interface ExecuteOptions extends SpawnOptions {
	// Provides stdin in options
	stdin?: intoStream.Input | NodeJS.ReadableStream | null;

	// What to do with stdout. See `options.stdio` on `child_process`
	// Default: 'pipe'
	stdout?: string | stream.Stream | number | null;

	// What to do with stdout. See `options.stdio` on `child_process`
	// Default: 'pipe'
	stderr?: string | stream.Stream | number | null;
}
/// @doc-end-code

///
/// ## function execute
///
/// <code>function execute(command: string | string[], options: ExecuteOptions): Promise\<{ stdout: Buffer | string | null, stderr: Buffer | string | null, exitCode: number | null, signalCode: string | null }\></code>
///
/// Shorthand for `execute(spawn(command, options), options.stdin)`. Closes spawned stdin if not provided so it will not wait on non-existent input.
export async function execute(command: string | string[], options: ExecuteOptions & { encoding: null }):
	Promise<{ stdout: Buffer | null, stderr: Buffer | null, exitCode: number | null, signalCode: string | null }>;
export async function execute(command: string | string[], options?: ExecuteOptions & { encoding?: BufferEncoding }):
	Promise<{ stdout: string | null, stderr: string | null, exitCode: number | null, signalCode: string | null }>;
export async function execute(command: any, options?: any): Promise<any> {
	const stdio = [
		(options && options.stdin !== undefined && options.stdin !== null) ? "pipe" : "ignore",
		(options && options.stdout) || "pipe",
		(options && options.stderr) || "pipe",
	];
	return communicate(spawn(command, { stdio, ...options }), options && options.stdin);
}

class ChildProcessTransform extends stream.Duplex implements NodeJS.ReadWriteStream {
	private stdout: NodeJS.ReadableStream;
	private stdin: NodeJS.WritableStream;

	constructor(cp: ChildProcess) {
		super();

		if(cp.stdout === null) {
			throw new Error("stdout is not readable, cannot create transform stream");
		}

		if(cp.stdin === null) {
			throw new Error("stdout is not writable, cannot create transform stream");
		}

		this.stdout = cp.stdout;
		this.stdin = cp.stdin;

		wait(cp).catch((err) => this.emit("error", err));

		this.stdout.on("error", (err) => this.emit("error", err));
		this.stdout.on("end", () => wait(cp).catch((e) => e).finally(() => this.push(null)));

		this.stdin.on("error", (err) => this.emit("error", err));

		this.stdout.on("data", (chunk) => {
			if(!this.push(chunk)) {
				this.stdout.pause();
			}
		});
	}

	/*
	 * Writable (stdin)
	 */
	// tslint:disable-next-line
	public _write(chunk: any, encoding: BufferEncoding, cb: (error?: Error | null) => void): void {
		this.stdin.write(chunk, encoding, cb);
	}

	// tslint:disable-next-line
	public _final(cb: (error?: Error | null) => void) {
		this.stdin.end(cb);
	}

	/*
	 * Readable (stdout)
	 */
	// tslint:disable-next-line
	public _read() {
		this.stdout.resume();
	}
}

///
/// ## function makePipe
///
/// <code>export function makePipe(cp: ChildProcess): NodeJS.ReadWriteStream</code>
///
/// Create a ReadWriteStream (suitable to be used by `ReadableStream.pipe()`) from child process's
/// stdin and stdout.
///
/// The checkExitCode and checkSignalsCode will be used to control wether the "error" event is triggered
/// on the stream on bad exit/signal status.
export function makePipe(cp: ChildProcess): NodeJS.ReadWriteStream {
	return new ChildProcessTransform(cp);
}
