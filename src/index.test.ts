import test from "ava";
import { communicate, execute, spawn, wait } from ".";

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

test("using array as command, shell special characters should be escaped", async (t) => {
	const args = ['"', "'", " \t\r\n", "!<>&|"];
	t.deepEqual(JSON.parse((await execute(["node", "-e", "console.log(JSON.stringify(process.argv))", ...args])).stdout!).slice(1), args);
});
