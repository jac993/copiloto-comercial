create table api_usage (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  api text not null,
  endpoint text,
  input_tokens int,
  output_tokens int,
  audio_seconds numeric,
  costo_usd numeric,
  empresa_id uuid references empresas(id) on delete set null
);
create index on api_usage(created_at desc);
create index on api_usage(api);
