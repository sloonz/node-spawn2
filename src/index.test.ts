import crypto from "crypto";
import process from "process";
import stream from "stream";

import test from "ava";
import intoStream from "into-stream";

import { communicate, execute, makePipe, spawn, wait } from ".";

test('spawn("true && true") should spawn a shell', async (t) => {
	const { exitCode } = await execute("true && true");
	t.is(exitCode, 0);
});

test('checkExitCode = true should raise an error for "false"', async (t) => {
	await t.throwsAsync(execute("false", { checkExitCode: true }));
	await t.throwsAsync(execute("false"));
});

test('checkExitCode = false should not raise an error for "false"', async (t) => {
	t.is((await execute("false", { checkExitCode: false })).exitCode, 1);
});

test('checkSignalCode = true should raise an error for "kill $$"', async (t) => {
	await t.throwsAsync(execute("kill $$", { checkSignalCode: true }));
	await t.throwsAsync(execute("kill $$"));
});

test('checkSignalCode = false should not raise an error for "kill $$"', async (t) => {
	t.deepEqual(await execute("kill $$", { checkSignalCode: false }), { exitCode: null, signalCode: "SIGTERM", stdout: "", stderr: "" });
});

test("wait should be callable twice", async (t) => {
	const cp = spawn("true");
	t.deepEqual(await wait(cp), { exitCode: 0, signalCode: null });
	t.deepEqual(await wait(cp), { exitCode: 0, signalCode: null });
});

test("no encoding provided should return a normal string", async (t) => {
	t.is((await execute("echo Hello")).stdout, "Hello");
});

test("null encoding should return a Buffer", async (t) => {
	t.is((await execute("echo Hello", { encoding: null })).stdout!.compare(Buffer.from("Hello\n")), 0);
});

test("trimOutput = false should not trim output", async (t) => {
	t.is((await execute("echo Hello", { trimOutput: false })).stdout, "Hello\n");
});

test("stdin = null should close stdin", async (t) => {
	t.timeout(2000);
	t.is((await execute("cat", { stdin: null })).stdout, "");
});

test("communicate() should not hang", async (t) => {
	const bytesBuf = Buffer.from([...Array(256).keys()]);
	const buf = Buffer.concat([...Array(1024).keys()].map(() => bytesBuf));

	t.timeout(2000);
	t.is((await execute("base64 -w0", { stdin: buf })).stdout, buf.toString("base64"));
});

test("string stdin", async (t) => {
	const buf = Buffer.from("Hello");

	t.timeout(2000);
	t.is(buf.compare((await execute("base64 -d", { stdin: buf.toString("base64"), encoding: null })).stdout!), 0);
});

test("passing a stream to stdin", async (t) => {
	const stdinStream = intoStream("Hello");

	t.timeout(2000);
	t.is((await execute(["cat"], { stdin: stdinStream })).stdout!, "Hello");
});

test("using array as command, shell special characters should be escaped", async (t) => {
	const args = ['"', "'", " \t\r\n", "!<>&|"];
	t.deepEqual(JSON.parse((await execute(["node", "-e", "console.log(JSON.stringify(process.argv))", ...args])).stdout!).slice(1), args);
});

class MonitorMemoryUsage extends stream.Transform {
	public maxHeap: number = 0;

	constructor() {
		super();
	}

	// tslint:disable-next-line
	_transform(chunk: any, encoding: string, cb: (err: Error | null) => void): void {
		this.push(chunk);

		const { heapUsed } = process.memoryUsage();
		if(heapUsed > this.maxHeap) {
			this.maxHeap = heapUsed;
		}

		// Simulate slow reader
		setTimeout(() => cb(null), 1);
	}
}

class Zeroes extends stream.Readable {
	private remainingSize: number;
	private buf: Buffer;

	constructor(size: number) {
		super();
		this.remainingSize = size;
		this.buf = Buffer.alloc(65536, 0);
	}

	// tslint:disable-next-line
	_read() {
		while(this.remainingSize) {
			const chunk = this.buf.slice(0, this.remainingSize);
			this.remainingSize -= chunk.length;
			if(!this.push(chunk)) {
				return;
			}
		}
		this.push(null);
	}
}

class Digest extends stream.Writable {
	public hash: crypto.Hash;

	constructor() {
		super();
		this.hash = crypto.createHash("sha256");
	}

	// tslint:disable-next-line
	_write(chunk: any, encoding: string, cb: (err: Error | null) => void): void {
		this.hash.update(chunk);
		cb(null);
	}
}

test("using makePipe should not use large amount of memory", async (t) => {
	// Generate 256 MiB worth of zeroes
	// dd if=/dev/zero of=/dev/stdout bs=$((1024*1024)) count=256 | sha256sum => a6d72ac7690f53be6ae46ba88506bd97302a093f7108472bd9efc3cefda06484

	const counter = new Zeroes(256 * 1024 * 1024);
	const dgst = new Digest();
	const mem = new MonitorMemoryUsage();
	const { heapUsed } = process.memoryUsage();
	const e = { encoding: null };

	await new Promise((resolve, reject) => {
		stream.pipeline([counter, makePipe(spawn(["base64"], e)), makePipe(spawn(["base64", "-d"], e)), mem, dgst],
			(err) => err ? reject(err) : resolve());
	});

	t.is(dgst.hash.digest("hex"), "a6d72ac7690f53be6ae46ba88506bd97302a093f7108472bd9efc3cefda06484");
	t.assert((mem.maxHeap - heapUsed) / (1024 * 1024) < 10); // Allow 10 MiB
});
