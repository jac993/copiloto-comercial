# Purgar la `service_role` de Supabase del historial de git

## Qué se filtró, exactamente

| | |
|---|---|
| **Archivo** | `.claude/settings.local.json` |
| **Secreto** | Clave `service_role` de Supabase (JWT) |
| **Proyecto** | `bxevihqkutmsxicfbjod` |
| **Commits afectados** | **256** |
| **Estado hoy** | El archivo ya no se trackea (se sacó en `a8dae31` y está en `.gitignore`), pero **sigue vivo en todo el historial** |

La `service_role` **se salta Row Level Security**. Quien la tenga puede
leer, modificar y borrar cualquier tabla de la base, sin pasar por la app ni
por Vercel. Es la clave más peligrosa del stack.

Para reproducir el diagnóstico:

```bash
git log --oneline --all -- ".claude/settings.local.json"
```

---

## ⚠️ Lo primero, y lo único que de verdad cierra el agujero: ROTAR

**Purgar el historial NO invalida la clave.** Estuvo publicada en GitHub;
hay que asumirla comprometida sin importar lo que hagas con git después:

- GitHub conserva los commits accesibles por SHA aún después de un
  force-push, hasta que corre su recolector interno.
- Cualquier fork o clon que se haya hecho la conserva íntegra.
- Los bots que escanean GitHub buscando claves la recogen en minutos. Una
  clave que estuvo expuesta en un repo se considera quemada.

**Haz esto antes que nada. El resto es higiene.**

1. Entra a [supabase.com/dashboard](https://supabase.com/dashboard) →
   proyecto `bxevihqkutmsxicfbjod`.
2. **Project Settings** → **API Keys**.
3. En la `service_role`, usa **Generate new key** / **Roll**.
4. Actualiza la clave nueva en los dos lados:
   - Local: `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.
   - Vercel: **Settings** → **Environment Variables** → editar y
     **redeploy** (las variables se leen en build; sin redeploy sigue la
     vieja).
5. Revisa los **Logs** de Supabase por accesos que no reconozcas.

> Verifica primero si el repo es público en
> `github.com/jac993/copiloto-comercial`. Si lo es, la rotación es urgente.
> Si siempre fue privado, el riesgo es bastante menor —pero la clave igual
> viajó a los servidores de GitHub y a tus clones, así que rotar sigue
> siendo lo correcto.

Después de rotar, la clave del historial es un string muerto. Purgarla es
ordenar, ya no contener un incidente.

---

## Purgar el historial con BFG

### Requisito: Java

BFG es un `.jar`:

```bash
java -version
```

Si no lo tienes: [adoptium.net](https://adoptium.net) (Temurin JRE 17).

### 1. Instalar BFG

Descarga el jar desde
[rtyley.github.io/bfg-repo-cleaner](https://rtyley.github.io/bfg-repo-cleaner/)
y déjalo en una carpeta de trabajo **fuera del repo**, por ejemplo
`~/bfg/bfg.jar`.

### 2. Respaldo

No te saltes esto. Los pasos siguientes reescriben el historial completo y
no tienen deshacer.

```bash
cd ~
git clone --mirror https://github.com/jac993/copiloto-comercial.git respaldo-copiloto.git
```

### 3. Clon espejo para trabajar

BFG opera sobre un clon `--mirror`, no sobre tu carpeta de trabajo:

```bash
cd ~/bfg
git clone --mirror https://github.com/jac993/copiloto-comercial.git
```

### 4. Borrar el archivo de todo el historial

```bash
java -jar bfg.jar --delete-files settings.local.json copiloto-comercial.git
```

BFG imprime cuántos commits tocó. Debe decir **256**.

> BFG nunca toca el commit al que apunta HEAD. Acá da igual: el archivo ya
> no se trackea en HEAD.

### 5. Compactar de verdad

Hasta acá los objetos viejos siguen en el repo. Este paso los elimina:

```bash
cd copiloto-comercial.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### 6. Confirmar antes de publicar

```bash
git log --all --oneline -- "**/settings.local.json" | wc -l
```

Debe imprimir **0**. Si no, no sigas: repite desde el paso 4.

### 7. Force-push

```bash
git push --force
```

**Destructivo e irreversible en el remoto.** Reescribe los SHA de los 256
commits. Como eres el único que trabaja en este repo, no rompes el trabajo
de nadie más, pero:

- Tu carpeta local queda desfasada. Bórrala y vuelve a clonar:
  ```bash
  cd ~ && rm -rf copiloto-comercial
  git clone https://github.com/jac993/copiloto-comercial.git
  ```
- Vercel verá SHAs nuevos y lanzará un deploy. Es esperable.
- Cualquier PR abierto contra los commits viejos queda inservible.

### 8. Pedirle a GitHub que purgue lo suyo

Aunque el force-push funcione, GitHub deja los commits viejos alcanzables
por su SHA hasta que corre su GC interno. Para forzarlo, abre un ticket en
[support.github.com](https://support.github.com) pidiendo *"garbage collect
unreachable objects"* sobre `jac993/copiloto-comercial`.

Este paso es opcional **solo si ya rotaste la clave**. Si no rotaste, es
obligatorio y aun así insuficiente.

---

## Cuando termines

- [ ] `service_role` rotada en Supabase
- [ ] `.env.local` actualizado con la clave nueva
- [ ] Variable actualizada en Vercel **+ redeploy**
- [ ] Logs de Supabase revisados
- [ ] Historial purgado y verificado (paso 6 = 0)
- [ ] Carpeta local re-clonada
- [ ] `.claude/settings.local.json` local limpio — **hoy todavía contiene un
      JWT**. Ya no se commitea, pero si vas a rotar, déjalo sin la clave.

---

## Alternativa: empezar de cero

256 commits es prácticamente todo el historial del proyecto. Si el pasado
no te importa, borrar el repo en GitHub y volver a subirlo como un commit
inicial limpio es más rápido y más seguro que BFG: no quedan objetos
sueltos ni hay que pedirle nada a GitHub Support.

Pierdes el historial completo. Para un proyecto personal de un solo
desarrollador suele ser un intercambio razonable.
