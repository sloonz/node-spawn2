import { expectType } from "tsd";
import { communicate, execute, spawn, wait } from ".";

Promise.all([
	async () => {
		const { exitCode, signalCode } = await wait(spawn("true"));
		expectType<number|null>(exitCode);
		expectType<string|null>(signalCode);
	},

	async () => {
		const { stdout, stderr } = await communicate(spawn("true"));
		expectType<string | null>(stdout);
		expectType<string | null>(stderr);
	},
	async () => {
		const { stdout, stderr } = await communicate(spawn("true", {}));
		expectType<string | null>(stdout);
		expectType<string | null>(stderr);
	},
	async () => {
		const { stdout, stderr } = await communicate(spawn("true", { encoding: "base64" }));
		expectType<string | null>(stdout);
		expectType<string | null>(stderr);
	},
	async () => {
		const { stdout, stderr } = await communicate(spawn("true", { encoding: "utf-8" }));
		expectType<string | null>(stdout);
		expectType<string | null>(stderr);
	},
	async () => {
		const { stdout, stderr } = await communicate(spawn("true", { encoding: null }));
		expectType<Buffer | null>(stdout);
		expectType<Buffer | null>(stderr);
	},

	async () => {
		const { stdout, stderr } = await execute("true");
		expectType<string | null>(stdout);
		expectType<string | null>(stderr);
	},
	async () => {
		const { stdout, stderr } = await execute("true", {});
		expectType<string | null>(stdout);
		expectType<string | null>(stderr);
	},
	async () => {
		const { stdout, stderr } = await execute("true", { encoding: "base64" });
		expectType<string | null>(stdout);
		expectType<string | null>(stderr);
	},
	async () => {
		const { stdout, stderr } = await execute("true", { encoding: "utf-8" });
		expectType<string | null>(stdout);
		expectType<string | null>(stderr);
	},
	async () => {
		const { stdout, stderr } = await execute("true", { encoding: null });
		expectType<Buffer | null>(stdout);
		expectType<Buffer | null>(stderr);
	},
]).catch((err) => { throw err; });
