create table if not exists knowledge_documents (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references sources(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null default 0,
  file_path text,
  version integer not null default 1,
  status text not null default 'UPLOADING',
  error_message text,
  markdown_path text,
  markdown_content text,
  sag_document_id uuid references documents(id) on delete set null,
  parse_settings jsonb not null default '{}',
  metadata jsonb not null default '{}',
  archived_at timestamptz,
  archived_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kd_project_status_idx on knowledge_documents (project_id, status);
create index if not exists kd_user_idx on knowledge_documents (user_id);
create unique index if not exists kd_project_version_unique
  on knowledge_documents (project_id, file_name, version) where archived_at is null;
