import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Heart,
  Check,
  Trash2,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import useInstalledMods from './useInstalledMods.js';
import InstallPackModal from './InstallPackModal.jsx';
import DepInstallModal from './DepInstallModal.jsx';
import { formatCount } from './ModsPage.jsx';
import { cfHeaders } from '../../lib/cfApi.js';
import './ModDetailPage.css';

export default function ModDetailPage({
  store,
  projectId,
  onBack = () => {},
  onPackInstalled = () => {}
}) {
  const { selected } = store;
  const [project, setProject] = useState(null);
  const [author, setAuthor] = useState('');
  const [failed, setFailed] = useState(false);
  const [showPackModal, setShowPackModal] = useState(false);
  const [showDepModal, setShowDepModal] = useState(false);
  const { installed, busy, errors, install, remove } = useInstalledMods(selected);

  useEffect(() => {
    setProject(null);
    setFailed(false);
    setAuthor('');
    const controller = new AbortController();
    const isCF = String(projectId).startsWith('cf:');

    async function loadProject() {
      if (isCF) {
        const cfId = Number(String(projectId).slice(3));
        const [projectResponse, descriptionResponse] = await Promise.all([
          fetch(`https://api.curseforge.com/v1/mods/${cfId}`, {
            headers: cfHeaders,
            signal: controller.signal
          }),
          fetch(`https://api.curseforge.com/v1/mods/${cfId}/description`, {
            headers: cfHeaders,
            signal: controller.signal
          })
        ]);
        if (!projectResponse.ok) throw new Error();
        const raw = (await projectResponse.json()).data;
        const description = descriptionResponse.ok ? (await descriptionResponse.json()).data : '';
        const typeByClass = { 6: 'mod', 12: 'resourcepack', 6552: 'shader', 6945: 'datapack' };
        setAuthor(raw.authors?.[0]?.name ?? '');
        setProject({
          id: `cf:${raw.id}`,
          project_id: `cf:${raw.id}`,
          cf_id: raw.id,
          source: 'cf',
          project_type: typeByClass[raw.classId] ?? 'mod',
          title: raw.name,
          description: raw.summary ?? '',
          body: description,
          bodyFormat: 'html',
          icon_url: raw.logo?.thumbnailUrl ?? raw.logo?.url ?? null,
          downloads: raw.downloadCount ?? 0,
          followers: raw.thumbsUpCount ?? 0,
          categories: (raw.categories ?? []).map((category) => category.name).filter(Boolean)
        });
        return;
      }

      const [projectResponse, membersResponse] = await Promise.all([
        fetch(`https://api.modrinth.com/v2/project/${projectId}`, { signal: controller.signal }),
        fetch(`https://api.modrinth.com/v2/project/${projectId}/members`, { signal: controller.signal })
      ]);
      if (!projectResponse.ok) throw new Error();
      const nextProject = await projectResponse.json();
      setProject({ ...nextProject, project_id: nextProject.id, source: 'modrinth' });
      if (membersResponse.ok) {
        const members = await membersResponse.json();
        const owner = members.find?.((member) => member.role === 'Owner') ?? members[0];
        setAuthor(owner?.user?.username ?? '');
      }
    }

    loadProject().catch((error) => {
      if (error.name !== 'AbortError') setFailed(true);
    });
    return () => controller.abort();
  }, [projectId]);

  const bodyHtml = useMemo(
    () => (project?.body
      ? DOMPurify.sanitize(project.bodyFormat === 'html' ? project.body : marked.parse(project.body))
      : ''),
    [project]
  );

  const id = project?.id ?? projectId;
  const isPack = project?.project_type === 'modpack';
  const contentType = isPack ? 'modpack' : (project?.project_type ?? 'mod');
  const isInstalled = Boolean(installed[id]);
  const isBusy = Boolean(busy[id]);
  const error = isPack ? '' : errors[id];

  return (
    <div className="mod-detail">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={15} /> Back to Browse
      </button>

      {failed ? (
        <div className="mods-status">
          <AlertTriangle size={26} /> Couldn&apos;t load this mod.
        </div>
      ) : !project ? (
        <div className="mods-status">
          <Loader2 size={22} className="spin" /> Loading…
        </div>
      ) : (
        <div className="mod-detail-scroll">
          <header className="mod-detail-head">
            {project.icon_url ? (
              <img className="mod-detail-icon" src={project.icon_url} alt="" />
            ) : (
              <span className="mod-detail-icon mod-icon-fallback">
                {project.title[0]?.toUpperCase()}
              </span>
            )}

            <div className="mod-detail-info">
              <h1>{project.title}</h1>
              <p className="mod-detail-desc">{project.description}</p>
              <div className="mod-detail-meta">
                {author && <span className="mod-detail-author">by {author}</span>}
                <span>
                  <Download size={12} /> {formatCount(project.downloads)}
                </span>
                <span>
                  <Heart size={12} /> {formatCount(project.followers)}
                </span>
                {project.categories?.slice(0, 4).map((c) => (
                  <span key={c} className="mod-detail-tag">{c}</span>
                ))}
              </div>
            </div>

            <div className="mod-detail-actions">
              {isPack ? (
                <button
                  className="accent-btn mod-detail-install"
                  onClick={() => setShowPackModal(true)}
                >
                  <Download size={15} /> Install Modpack
                </button>
              ) : isBusy ? (
                <button className="accent-btn mod-detail-install" disabled>
                  <Loader2 size={15} className="spin" /> Installing…
                </button>
              ) : isInstalled ? (
                <button
                  className="accent-btn mod-detail-install mod-detail-remove"
                  onClick={() => remove(id)}
                >
                  <Check size={15} className="mod-check" />
                  <Trash2 size={15} className="mod-trash" />
                  <span className="label-installed">Installed</span>
                  <span className="label-remove">Remove</span>
                </button>
              ) : (
                <button
                  className="accent-btn mod-detail-install"
                  onClick={() => contentType === 'mod'
                    ? setShowDepModal(true)
                    : install(project, contentType)}
                >
                  <Download size={15} /> Install
                </button>
              )}
              <small className={`mod-detail-target${error ? ' has-error' : ''}`}>
                {error ||
                  (isPack
                    ? 'Installs as a new instance'
                    : selected
                      ? `For: ${selected.name} (${selected.loader} ${selected.version})`
                      : '')}
              </small>
            </div>
          </header>

          <article
            className="mod-detail-body prose"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </div>
      )}

      {showPackModal && project && (
        <InstallPackModal
          project={project}
          onClose={() => setShowPackModal(false)}
          onInstalled={(instance) => {
            store.add(instance);
            setShowPackModal(false);
            onPackInstalled(instance.id);
          }}
        />
      )}

      {showDepModal && project && (
        <DepInstallModal
          mod={{ ...project, author }}
          instance={selected}
          onClose={() => setShowDepModal(false)}
          onConfirm={async (selectedDeps, resolvedMod) => {
            setShowDepModal(false);
            for (const dep of selectedDeps) await install(dep, 'mod');
            await install(resolvedMod ?? project, 'mod');
          }}
        />
      )}
    </div>
  );
}
