# spawn2

<code>const { communicate, execute, spawn, wait } = require('spawn2');</code>

Like the NodeJS `child_process` module, this module provides the ability to spawn children processes.
In addition to a `spawn()` function very similar to the NodeJS one, it also provides an higher level interface for more common tasks.

Main differences with `child_process` are:
 * The IPC interface (`subprocess.send` and `process.on("message")`) are not provided
 * Higer level API, based on promises
 * `exitCode` and `signalCode` are exposed. With `child_process`, if `.on("exit")` is called after the process has exited,
   the callback will never be called. Exposing `exitCode` and `signalCode` escapes this pitfall.
 * More convenient stdio management in common cases (reading or writing `Buffer`/`string`)
 * More convenient `exitCode`/`signalCode` in common cases (throws an error in case of a non-zero exit code/non-null signal code)

## class ChildProcessError

Thrown by `wait()`, `communicate()` and `execute()` when:
 * the exit code is not zero, and `checkExitCode` is `true`, or
 * the status code is not null, and `checkStatusCode` is `true`

<pre><code>
class ChildProcessError extends Error {
	public childProcess: ChildProcess;
}
</code></pre>

## interface SpawnOptions

Options when spawning a new processes. They are the same as `child_process`, but with some additions.

<pre><code>
interface SpawnOptions extends child_process.SpawnOptions {
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
</code></pre>

## interface ChildProcess

Similar to `child_process.ChildProcess`, it is returned by `spawn()` on success.

<pre><code>
interface ChildProcess {
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
}
</code></pre>

## function spawn

<code>function spawn(command: string|string[], options?: SpawnOptions): ChildProcess</code>

Spawn a new process. The executable is `command[0]`, the rest of the array is used to provide arguments.
If `command` is a string, it will be assumed to be a shell command to be interpreted by `/bin/sh`.

Example:

<code>spawn(["cat", "/etc/fstab"])</code>
## function wait

<code>function wait(cp: ChildProcess): Promise\<{ exitCode: number | null, signalCode: string | null }\></code>

Wait for the process to terminate, and returns the exit code and signal code.
Note that this may throws an error instead of returning if `checkExitCode` or `checkStatusCode` is true.

## function communicate

<code>function communicate(cp: ChildProcess, stdin?: intoStream.Input): Promise\<{ stdout: Buffer | string | null, stderr: Buffer | string | null, exitCode: number | null, signalCode: string | null }\></code>

Sends stdin to a running process, reads stdout and stderr and waits for the process to terminate.
The return type of stdout and stderr is determined by the `encoding` option.

## interface ExecuteOptions

Additional options for `execute()`

<pre><code>
interface ExecuteOptions extends SpawnOptions {
	// Provides stdin in options
	stdin?: intoStream.Input | null;

	// What to do with stdout. See `options.stdio` on `child_process`
	// Default: 'pipe'
	stdout?: string | stream.Stream | number | null;

	// What to do with stdout. See `options.stdio` on `child_process`
	// Default: 'pipe'
	stderr?: string | stream.Stream | number | null;
}
</code></pre>

## function execute

<code>function execute(command: string | string[], options: ExecuteOptions): Promise\<{ stdout: Buffer | string | null, stderr: Buffer | string | null, exitCode: number | null, signalCode: string | null }\></code>

Shorthand for `execute(spawn(command, options), options.stdin)`. Closes spawned stdin if not provided so it will not wait on non-existent input.
