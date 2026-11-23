/** Lightweight anonymous identity: the browser keeps a random UUID and sends it as a header.
 *  Replace with real authentication (e.g. Auth.js) if you need accounts. */
export function getUserId(req: Request): string | null {
  const id = req.headers.get("x-grocerly-user");
  return id && /^[a-zA-Z0-9-]{16,64}$/.test(id) ? id : null;
}
