/** Authenticated, conflict-safe CMS client. All writes use the server proxy. */
(function (global) {
  const PROXY = '/.netlify/functions/cms-git';
  async function api(method, path, body) {
    const user = global.netlifyIdentity && global.netlifyIdentity.currentUser();
    if (!user) throw new Error('Sign in to edit the site.');
    const token = await user.jwt();
    const response = await fetch(PROXY + '?path=' + encodeURIComponent(path), {
      method,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let data;
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) {
      const message = response.status === 409
        ? 'Another editor changed this file. Your unsaved changes are still here. Reload the saved version and reapply your changes before saving.'
        : data.message || data.error || 'The editor could not save. Please try again.';
      const error = new Error(message); error.status = response.status; throw error;
    }
    return data;
  }
  function encode(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(binary);
  }
  async function getFile(path) {
    const data = await api('GET', path);
    const bytes = Uint8Array.from(atob(String(data.content || '').replace(/\s/g, '')), c => c.charCodeAt(0));
    return { content: new TextDecoder().decode(bytes), sha: data.sha, path: data.path || path };
  }
  async function getJson(path) { const file = await getFile(path); return { data: JSON.parse(file.content), sha: file.sha, path: file.path }; }
  async function putBinary(path, buffer, message, sha) {
    return api('PUT', path, { content: encode(new Uint8Array(buffer)), message: message || 'Update ' + path, ...(sha ? { sha } : {}) });
  }
  async function putFile(path, content, message, sha) { return putBinary(path, new TextEncoder().encode(content), message, sha); }
  async function putJson(path, data, message, sha) { return putFile(path, JSON.stringify(data, null, 2) + '\n', message, sha); }
  async function listDir(path) { try { const result = await api('GET', path); return Array.isArray(result) ? result : []; } catch (error) { if (error.status === 404) return []; throw error; } }
  async function deleteFile(path, sha, message) { return api('DELETE', path, { sha, message: message || 'Delete ' + path }); }
  global.GMF_GIT = { getFile, getJson, putFile, putJson, putBinary, listDir, deleteFile };
})(window);
