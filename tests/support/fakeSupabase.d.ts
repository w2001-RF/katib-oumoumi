// Loose types for the JavaScript fake, so TypeScript tests can import it.
// deno-lint-ignore-file no-explicit-any
export function kind(call: any): string;
export function argsOf(call: any, method: string): any;
export function createFakeClient(handler?: (call: any) => any): any;
export const sharedClient: any;
export function createClient(): any;
