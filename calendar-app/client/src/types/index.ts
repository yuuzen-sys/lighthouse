export interface User {
  id: string;
  name: string;
  email: string;
  color: string;
}

export interface Calendar {
  id: string;
  name: string;
  color: string;
  owner_id: string;
  is_default: number;
  role: 'owner' | 'editor' | 'viewer';
  member_count: number;
}

export interface CalendarMember {
  id: string;
  name: string;
  email: string;
  color: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface CalendarEvent {
  id: string;
  calendar_id: string;
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  all_day: number;
  color: string | null;
  created_by: string;
  calendar_color: string;
  calendar_name: string;
}

export type ViewMode = 'month' | 'week' | 'day';
