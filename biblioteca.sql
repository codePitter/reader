-- ═══════════════════════════════════════════════════════════════
-- BIBLIOTECA — Tabla de metadata de libros del usuario
-- Ejecutar en: Supabase → SQL Editor
--
-- Los archivos NUNCA se guardan aquí.
-- Solo se guarda metadata + referencia a IndexedDB (idb_key).
-- ═══════════════════════════════════════════════════════════════

create table if not exists biblioteca (
    id              uuid        primary key default gen_random_uuid(),
    user_id         uuid        not null references auth.users(id) on delete cascade,

    -- Metadata del libro
    titulo          text        not null,
    autor           text,
    formato         text        not null check (formato in ('epub','pdf','txt','fb2','fb3','docx','rtf','odt','mobi','prc','azw3','azw','cbz','cbr')),
    portada         text,       -- base64 de la portada (null si no hay)
    tamano          bigint,     -- tamaño en bytes del archivo original

    -- Progreso de lectura
    progreso        float       not null default 0 check (progreso >= 0 and progreso <= 1),
    cap_actual      int         not null default 0,
    total_caps      int         not null default 0,

    -- Referencia al archivo en IndexedDB del dispositivo
    -- Es el mismo UUID que el id del registro
    idb_key         text        not null,

    -- Timestamps
    fecha_agregado  timestamptz not null default now(),
    fecha_leido     timestamptz         -- última vez que se abrió

);

-- ── Índices ──────────────────────────────────────────────────────
create index if not exists biblioteca_user_id_idx
    on biblioteca (user_id);

create index if not exists biblioteca_fecha_idx
    on biblioteca (user_id, fecha_agregado desc);

-- ── Row Level Security ───────────────────────────────────────────
alter table biblioteca enable row level security;

-- Cada usuario solo ve y modifica sus propios libros
create policy "usuarios ven sus propios libros"
    on biblioteca for select
    using (auth.uid() = user_id);

create policy "usuarios insertan sus propios libros"
    on biblioteca for insert
    with check (auth.uid() = user_id);

create policy "usuarios actualizan sus propios libros"
    on biblioteca for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "usuarios eliminan sus propios libros"
    on biblioteca for delete
    using (auth.uid() = user_id);

-- ── Función para actualizar solo el progreso (más eficiente) ─────
create or replace function actualizar_progreso_libro(
    p_id        uuid,
    p_progreso  float,
    p_cap       int,
    p_total     int
)
returns void
language plpgsql
security definer
as $$
begin
    update biblioteca
    set
        progreso    = p_progreso,
        cap_actual  = p_cap,
        total_caps  = p_total,
        fecha_leido = now()
    where id = p_id
      and user_id = auth.uid();
end;
$$;
