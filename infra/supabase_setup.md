# Supabase külső tartós storage setup

1. Hozz létre egy Supabase projektet.
2. A SQL Editorban futtasd le az `infra/supabase_schema.sql` fájlt.
3. A Storage részen hozz létre egy bucketet: `nexus-artifacts`
4. A Project Settings / API részen másold ki:
   - SUPABASE_URL
   - service_role / secret key
5. Ezeket állítsd be Render environment variable-ként.
