export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(method, url, body) {
  const init = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Network error. Check your connection.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data);
  return data;
}

export const api = {
  demoUsers: () => request('GET', '/api/auth/demo-users'),
  login: (email) => request('POST', '/api/auth/login', { email }),
  logout: () => request('POST', '/api/auth/logout'),
  me: () => request('GET', '/api/auth/me'),
  users: () => request('GET', '/api/users'),
  listDocs: () => request('GET', '/api/documents'),
  createDoc: (data = {}) => request('POST', '/api/documents', data),
  getDoc: (id) => request('GET', `/api/documents/${id}`),
  updateDoc: (id, data) => request('PATCH', `/api/documents/${id}`, data),
  deleteDoc: (id) => request('DELETE', `/api/documents/${id}`),
  share: (id, email, role) => request('POST', `/api/documents/${id}/shares`, { email, role }),
  unshare: (id, userId) => request('DELETE', `/api/documents/${id}/shares/${userId}`),
  importAsNew: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', '/api/documents/import', fd);
  },
  importInto: (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', `/api/documents/${id}/import`, fd);
  },
  exportUrl: (id, format) => `/api/documents/${id}/export?format=${format}`,
};

export const SUPPORTED_UPLOADS = '.txt,.md,.markdown,.docx';
export const UPLOAD_HELP = 'Supported: .txt, .md, .docx (max 2 MB)';
