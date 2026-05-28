const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'エラーが発生しました');
  return data as T;
}

export const api = {
  auth: {
    register: (name: string, email: string, password: string) =>
      request<{ token: string; user: import('../types').User }>('/auth/register', {
        method: 'POST', body: JSON.stringify({ name, email, password }),
      }),
    login: (email: string, password: string) =>
      request<{ token: string; user: import('../types').User }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      }),
    me: () => request<{ user: import('../types').User }>('/auth/me'),
  },
  calendars: {
    list: () => request<{ calendars: import('../types').Calendar[] }>('/calendars'),
    create: (name: string, color: string) =>
      request<{ calendar: import('../types').Calendar }>('/calendars', {
        method: 'POST', body: JSON.stringify({ name, color }),
      }),
    update: (id: string, data: { name?: string; color?: string }) =>
      request<{ calendar: import('../types').Calendar }>(`/calendars/${id}`, {
        method: 'PUT', body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/calendars/${id}`, { method: 'DELETE' }),
    members: (id: string) =>
      request<{ members: import('../types').CalendarMember[] }>(`/calendars/${id}/members`),
    addMember: (id: string, email: string, role: string) =>
      request<{ ok: boolean }>(`/calendars/${id}/members`, {
        method: 'POST', body: JSON.stringify({ email, role }),
      }),
    removeMember: (id: string, userId: string) =>
      request<{ ok: boolean }>(`/calendars/${id}/members/${userId}`, { method: 'DELETE' }),
  },
  events: {
    list: (start?: string, end?: string) => {
      const params = new URLSearchParams();
      if (start) params.set('start', start);
      if (end) params.set('end', end);
      return request<{ events: import('../types').CalendarEvent[] }>(`/events?${params}`);
    },
    create: (data: {
      calendar_id: string; title: string; description?: string;
      start_at: string; end_at: string; all_day?: boolean; color?: string;
    }) => request<{ event: import('../types').CalendarEvent }>('/events', {
      method: 'POST', body: JSON.stringify(data),
    }),
    update: (id: string, data: Partial<{
      title: string; description: string; start_at: string; end_at: string;
      all_day: boolean; color: string; calendar_id: string;
    }>) => request<{ event: import('../types').CalendarEvent }>(`/events/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/events/${id}`, { method: 'DELETE' }),
  },
  invitations: {
    create: (calendar_id: string, role: 'editor' | 'viewer') =>
      request<{ token: string }>('/invitations', {
        method: 'POST', body: JSON.stringify({ calendar_id, role }),
      }),
    get: (token: string) =>
      request<{ invitation: { token: string; role: string; calendar_name: string; calendar_color: string; inviter_name: string } }>(`/invitations/${token}`),
    join: (token: string, name: string) =>
      request<{ token: string; user: import('../types').User }>(`/invitations/${token}/join`, {
        method: 'POST', body: JSON.stringify({ name }),
      }),
  },
};
