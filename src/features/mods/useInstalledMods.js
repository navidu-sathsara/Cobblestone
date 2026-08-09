import { useCallback, useEffect, useState } from 'react';
import { downloadBus } from '../../lib/downloadBus.js';
import { cfHeaders } from '../../lib/cfApi.js';
import { getInstallPlan, isCurseForgeProject, projectKey } from '../../lib/contentApi.js';

/**
 * Installed-mod state + install/remove actions for one instance.
 * `installed` maps projectId -> the persisted file and project metadata.
 * Supports both Modrinth (project_id) and CurseForge (cf:id) mods.
 */
export default function useInstalledMods(instance) {
  const [installed, setInstalled] = useState({});
  const [busy, setBusy]           = useState({});
  const [errors, setErrors]       = useState({});

  const refresh = useCallback(() => {
    if (instance && window.native?.mods) {
      window.native.mods.installed(instance.id).then(setInstalled);
    } else {
      setInstalled({});
    }
  }, [instance?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const flashError = (id, message) => {
    setErrors((prev) => ({ ...prev, [id]: message }));
    setTimeout(() => {
      setErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }, 4000);
  };

  // destination folder per content type
  const FOLDERS = {
    mod: 'mods',
    resourcepack: 'resourcepacks',
    shader: 'shaderpacks',
    datapack: 'datapacks',
  };

  // CurseForge modLoader enum values
  const CF_LOADER = { Forge: 1, Fabric: 4, Quilt: 5, NeoForge: 6 };

  const install = async (mod, contentType = 'mod') => {
    const isCF = isCurseForgeProject(mod);
    const projectId = projectKey(mod);

    if (!instance) return;
    if (contentType === 'mod' && instance.loader === 'Vanilla') {
      flashError(projectId, 'Needs a Fabric or Forge instance');
      return;
    }
    if (!window.native?.mods) {
      flashError(projectId, 'Install works in the desktop app only');
      return;
    }

    setBusy((prev) => ({ ...prev, [projectId]: true }));
    downloadBus.add(projectId, mod.title ?? 'Unknown');

    try {
      let url, filename, resolvedMod = mod, resolvedVersion = '';

      if (mod.installFile?.url && mod.installFile?.filename) {
        ({ url, filename } = mod.installFile);
        resolvedVersion = mod.installFile.version ?? '';
      } else if (contentType === 'mod') {
        const plan = await getInstallPlan(mod, instance);
        resolvedMod = plan.mainMod;
        ({ url, filename } = plan.mainMod.installFile);
        resolvedVersion = plan.mainMod.installFile.version ?? '';
      } else if (isCF) {
        // ── CurseForge file resolution ──────────────────────────
        const loaderNum = CF_LOADER[instance.loader] ?? 1;
        const resp      = await fetch(
          `https://api.curseforge.com/v1/mods/${mod.cf_id}/files` +
          `?gameVersion=${instance.version}&modLoaderType=${loaderNum}&pageSize=5`,
          { headers: cfHeaders }
        );
        if (!resp.ok) throw new Error(`CurseForge returned HTTP ${resp.status}`);
        const { data: files } = await resp.json();
        if (!Array.isArray(files) || files.length === 0) {
          throw new Error(`No CurseForge build for ${instance.version}`);
        }
        if (!files[0].downloadUrl) {
          throw new Error('File distribution disabled by author');
        }
        url      = files[0].downloadUrl;
        filename = files[0].fileName;
      } else {
        // ── Modrinth file resolution ────────────────────────────
        const loaders =
          contentType === 'mod'
            ? [instance.loader.toLowerCase()]
            : contentType === 'datapack'
              ? ['datapack']
              : null;
        const query =
          `?game_versions=${encodeURIComponent(JSON.stringify([instance.version]))}` +
          (loaders ? `&loaders=${encodeURIComponent(JSON.stringify(loaders))}` : '');
        const versions = await (
          await fetch(`https://api.modrinth.com/v2/project/${mod.project_id}/version${query}`)
        ).json();
        if (!Array.isArray(versions) || versions.length === 0) {
          throw new Error(`No build for ${instance.version}`);
        }
        const file = versions[0].files.find((f) => f.primary) ?? versions[0].files[0];
        url      = file.url;
        filename = file.filename;
      }

      const manifest = await window.native.mods.install({
        instanceId: instance.id,
        projectId,
        url,
        filename,
        folder: FOLDERS[contentType] ?? 'mods',
        metadata: {
          title: resolvedMod.title ?? mod.title ?? filename,
          description: resolvedMod.description ?? mod.description ?? '',
          iconUrl: resolvedMod.icon_url ?? mod.icon_url ?? '',
          author: resolvedMod.author ?? mod.author ?? '',
          source: isCurseForgeProject(resolvedMod) ? 'cf' : 'modrinth',
          version: resolvedVersion
        }
      });
      setInstalled(manifest);
    } catch (err) {
      flashError(projectId, err.message);
    } finally {
      downloadBus.remove(projectId);
      setBusy((prev) => ({ ...prev, [projectId]: false }));
    }
  };

  const remove = async (projectId) => {
    const manifest = await window.native.mods.remove({ instanceId: instance.id, projectId });
    setInstalled(manifest);
  };

  return { installed, busy, errors, install, remove, refresh };
}
