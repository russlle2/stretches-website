/**
 * Thin Git Gateway client for Netlify Identity + Git Gateway.
 * Reads/writes files in the linked GitHub repo via /.netlify/git/github
 */
(function (global) {
  const API = '/.netlify/git/github';

  function getToken() {
    const user = global.netlifyIdentity && global.netlifyIdentity.currentUser();
    if (!user) throw new Error('Not signed in');
    return user.token && user.token.access_token;
  }

  async function api(path, options = {}) {
    const token = getToken();
    const res = await fetch(API + path, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github.v3+json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = text;
      try {
        const j = JSON.parse(text);
        msg = j.message || j.msg || text;
      } catch (_) {}
      throw new Error(msg || ('Git Gateway error ' + res.status));
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function encodePath(filePath) {
    return filePath
      .split('/')
      .map(encodeURIComponent)
      .join('/');
  }

  async function getFile(path) {
    const data = await api('/contents/' + encodePath(path));
    const content = decodeURIComponent(
      escape(atob(data.content.replace(/\n/g, '')))
    );
    return { content, sha: data.sha, path: data.path };
  }

  async function getJson(path) {
    const file = await getFile(path);
    return { data: JSON.parse(file.content), sha: file.sha, path: file.path };
  }

  async function putFile(path, content, message, sha) {
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const body = {
      message: message || ('Update ' + path),
      content: encoded,
      branch: 'master',
    };
    if (sha) body.sha = sha;
    return api('/contents/' + encodePath(path), {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async function putJson(path, data, message, sha) {
    const content = JSON.stringify(data, null, 2) + '\n';
    return putFile(path, content, message, sha);
  }

  async function putBinary(path, arrayBuffer, message, sha) {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const encoded = btoa(binary);
    const body = {
      message: message || ('Upload ' + path),
      content: encoded,
      branch: 'master',
    };
    if (sha) body.sha = sha;
    return api('/contents/' + encodePath(path), {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async function listDir(path) {
    try {
      const data = await api('/contents/' + encodePath(path));
      return Array.isArray(data) ? data : [];
    } catch (e) {
      if (String(e.message).includes('404') || String(e.message).toLowerCase().includes('not found')) {
        return [];
      }
      throw e;
    }
  }

  async function deleteFile(path, sha, message) {
    return api('/contents/' + encodePath(path), {
      method: 'DELETE',
      body: JSON.stringify({
        message: message || ('Delete ' + path),
        sha,
        branch: 'master',
      }),
    });
  }

  global.GMF_GIT = {
    getFile,
    getJson,
    putFile,
    putJson,
    putBinary,
    listDir,
    deleteFile,
  };
})(window);
