// Who is signed in on this device. Signed-out visitors get the guard's 401.
export default defineEventHandler((event) => {
  return { viewer: requireViewer(event) };
});
