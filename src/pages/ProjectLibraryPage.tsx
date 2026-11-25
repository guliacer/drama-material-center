import {
  ArrowLeft,
  BrainCircuit,
  FolderOpen,
  Grid2X2,
  List,
  PanelLeftOpen,
  RefreshCw,
  Search,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { DirectoryList } from "../components/DirectoryList";
import { FileList, type AssetDisplay } from "../components/FileList";
import { FilePreviewDialog } from "../components/FilePreviewDialog";
import { PreviewPane } from "../components/PreviewPane";
import { ProjectViewTabs } from "../components/ProjectViewTabs";
import { Sidebar } from "../components/Sidebar";
import { ThemeToggle } from "../components/ThemeToggle";
import { VideoPracticeNavLink } from "../components/VideoPracticeNavLink";
import {
  assetsWithinDirectory,
  directoriesAtDirectory,
  normalizeLegacyLibraryLocation,
  normalizeLegacyLibrarySearch,
} from "../lib/explorerTree";
import { formatBytes, getMaterials, getProjects, revealMaterial, searchMaterialText, uploadMaterials } from "../lib/materials";
import { naturalProductionCompare, productionMetaFor, productionStageIndex } from "../lib/production";
import { projectLibraryPath } from "../lib/routes";
import type { MaterialAsset, MaterialDirectory, ProjectSummary } from "../types";

type SortMode = "updated" | "name" | "production";
type SearchScope = "current" | "project";
type PreviewPresentation = "workspace" | "dialog";
const DEFAULT_SIDEBAR_WIDTH = 284;
const MIN_SIDEBAR_WIDTH = 238;
const MAX_SIDEBAR_WIDTH = 410;
const RESIZE_STEP = 24;

function storedWidth(key: string, fallback: number) {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function directoryForAsset(assetPath: string) {
  return assetPath.split("/").slice(0, -1).join("/");
}

export function ProjectLibraryPage() {
  const params = useParams();
  const projectId = params.projectId ?? "";
  const selectedPath = (params["*"] ?? "").split("/").filter(Boolean).join("/");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("file") ?? undefined;
  const requestedPreview = searchParams.get("preview");
  const previewPresentation: PreviewPresentation = requestedPreview === "dialog" ? "dialog" : "workspace";
  const query = searchParams.get("search") ?? "";
  const sortMode: SortMode = searchParams.get("sort") === "name"
    ? "name"
    : searchParams.get("sort") === "production"
      ? "production"
      : "updated";
  const requestedScope = searchParams.get("scope");
  const searchScope: SearchScope = requestedScope === "project" ? "project" : "current";
  const includeContent = searchParams.get("content") === "1";
  const requestedDisplay = searchParams.get("display");
  const searching = Boolean(query.trim());

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [assets, setAssets] = useState<MaterialAsset[]>([]);
  const [directories, setDirectories] = useState<MaterialDirectory[]>([]);
  const [treeDrawerOpen, setTreeDrawerOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => storedWidth("material-center:sidebar-width", DEFAULT_SIDEBAR_WIDTH));
  const [textMatches, setTextMatches] = useState<Map<string, string>>(new Map());
  const [textSearchLoading, setTextSearchLoading] = useState(false);
  const [textSearchError, setTextSearchError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadFolder, setUploadFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const layoutRef = useRef<HTMLElement>(null);
  const resizeStart = useRef({ pointerX: 0, sidebarWidth: DEFAULT_SIDEBAR_WIDTH });
  const resizing = useRef(false);

  const constrainSidebarWidth = useCallback((nextSidebar: number) => {
    const available = layoutRef.current?.clientWidth ?? window.innerWidth;
    return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, available - 520, nextSidebar));
  }, []);

  useEffect(() => {
    const constrainOnResize = () => {
      if (window.innerWidth <= 1180) return;
      setSidebarWidth(constrainSidebarWidth(sidebarWidth));
    };
    constrainOnResize();
    window.addEventListener("resize", constrainOnResize);
    return () => {
      window.removeEventListener("resize", constrainOnResize);
      document.body.classList.remove("is-resizing-panels");
    };
  }, [constrainSidebarWidth, sidebarWidth]);

  useEffect(() => window.localStorage.setItem("material-center:sidebar-width", String(Math.round(sidebarWidth))), [sidebarWidth]);

  useEffect(() => {
    const normalized = normalizeLegacyLibraryLocation(searchParams, assets);
    if (!normalized.changed || loading) return;
    navigate({
      pathname: projectLibraryPath(projectId, normalized.directoryPath ?? ""),
      search: normalized.search.size ? `?${normalized.search}` : "",
    }, { replace: true });
  }, [assets, loading, navigate, projectId, searchParams]);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    resizing.current = true;
    resizeStart.current = { pointerX: event.clientX, sidebarWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing-panels");
  }

  function resizePanels(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resizing.current) return;
    const delta = event.clientX - resizeStart.current.pointerX;
    setSidebarWidth(constrainSidebarWidth(resizeStart.current.sidebarWidth + delta));
  }

  function stopResize() {
    resizing.current = false;
    document.body.classList.remove("is-resizing-panels");
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const projectResponse = await getProjects();
      setProjects(projectResponse.projects);
      const materialResponse = await getMaterials(projectId);
      setAssets(materialResponse.assets);
      setDirectories(materialResponse.directories);
    } catch (reason) {
      setAssets([]);
      setDirectories([]);
      setError(reason instanceof Error ? reason.message : "无法读取本地素材目录");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const suggestedFolder = useMemo(() => {
    if (!uploadFiles.length) return "";
    const first = uploadFiles[0];
    const ext = first.name.split(".").pop()?.toLowerCase() ?? "";
    const isImage = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "svg"].includes(ext);
    const isVideo = ["mp4", "mov", "mkv", "webm", "avi", "m4v"].includes(ext);
    const isAudio = ["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext);
    const isText = ["md", "txt", "json", "srt", "vtt"].includes(ext);
    if (isImage) return "图片/参考";
    if (isVideo) return "视频/参考";
    if (isAudio) return "音频/BGM";
    if (isText) return "剧情/统一";
    return "";
  }, [uploadFiles]);

  function openUpload() {
    if (selectedPath) setUploadFolder(selectedPath);
    else setUploadFolder(suggestedFolder || "");
    setUploadFiles([]);
    setUploadStatus(null);
    setDragOver(false);
    setUploadOpen(true);
  }

  function closeUpload() {
    if (uploading) return;
    setUploadOpen(false);
    setUploadFiles([]);
    setUploadStatus(null);
  }

  function pickFiles(files: FileList | null) {
    if (!files?.length) return;
    const next = Array.from(files);
    setUploadFiles((prev) => [...prev, ...next]);
    setUploadStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submitUpload() {
    if (!uploadFiles.length || uploading) return;
    setUploading(true);
    setUploadStatus(null);
    try {
      const result = await uploadMaterials(projectId, uploadFiles, uploadFolder.trim());
      setUploadStatus({ kind: "ok", text: `已成功导入 ${result.count} 个文件到“${uploadFolder.trim() || "library 根目录"}”。` });
      setUploadFiles([]);
      await refresh();
    } catch (reason) {
      setUploadStatus({ kind: "error", text: reason instanceof Error ? reason.message : "上传失败" });
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    const normalized = query.trim();
    if (!includeContent || normalized.length < 2) {
      setTextMatches(new Map());
      setTextSearchError("");
      setTextSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setTextSearchLoading(true);
      setTextSearchError("");
      searchMaterialText(projectId, normalized, controller.signal)
        .then(({ results }) => setTextMatches(new Map(results.map((result) => [result.path, result.snippet]))))
        .catch((reason: unknown) => {
          if (!(reason instanceof DOMException && reason.name === "AbortError")) {
            setTextSearchError(reason instanceof Error ? reason.message : "无法搜索文档正文");
          }
        })
        .finally(() => { if (!controller.signal.aborted) setTextSearchLoading(false); });
    }, 260);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [includeContent, projectId, query]);

  const currentDirectories = useMemo(() => {
    if (searching) return [];
    return directoriesAtDirectory(directories, selectedPath).map((directory) => ({
      ...directory,
      fileCount: assetsWithinDirectory(assets, directory.path).length,
    }));
  }, [assets, directories, searching, selectedPath]);

  const scopedAssets = useMemo(() => {
    if (searchScope === "project") return assets;
    return assetsWithinDirectory(assets, selectedPath);
  }, [assets, searchScope, selectedPath]);

  const visibleAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return [...scopedAssets]
      .filter((asset) => !normalizedQuery
        || `${asset.name} ${asset.folder}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
        || (includeContent && textMatches.has(asset.path)))
      .sort((left, right) => {
        if (sortMode === "updated") return right.updatedAt.localeCompare(left.updatedAt);
        if (sortMode === "name") return naturalProductionCompare(left.name, right.name);
        const leftMeta = productionMetaFor(left);
        const rightMeta = productionMetaFor(right);
        return (leftMeta.episode ?? Number.MAX_SAFE_INTEGER) - (rightMeta.episode ?? Number.MAX_SAFE_INTEGER)
          || productionStageIndex(leftMeta.stage) - productionStageIndex(rightMeta.stage)
          || (leftMeta.shot ?? "").localeCompare(rightMeta.shot ?? "", "zh-CN", { numeric: true })
          || naturalProductionCompare(left.name, right.name);
      });
  }, [includeContent, query, scopedAssets, sortMode, textMatches]);

  const selectedAsset = assets.find((asset) => asset.id === selectedId);

  useEffect(() => {
    if (loading || !selectedAsset || previewPresentation === "dialog") return;
    const parentPath = directoryForAsset(selectedAsset.path);
    if (parentPath === selectedPath) return;
    navigate({
      pathname: projectLibraryPath(projectId, parentPath),
      search: searchParams.size ? `?${searchParams}` : "",
    }, { replace: true });
  }, [loading, navigate, previewPresentation, projectId, searchParams, selectedAsset, selectedPath]);

  useEffect(() => {
    if (loading) return;
    const fileExists = selectedId ? assets.some((asset) => asset.id === selectedId) : false;
    const invalidFile = Boolean(selectedId && !fileExists);
    const orphanPreview = !selectedId && requestedPreview !== null;
    const invalidPreview = requestedPreview !== null && requestedPreview !== "dialog";
    if (!invalidFile && !orphanPreview && !invalidPreview) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (invalidFile) next.delete("file");
      if (orphanPreview || invalidPreview) next.delete("preview");
      return next;
    }, { replace: true });
  }, [assets, loading, requestedPreview, selectedId, setSearchParams]);

  function updateSearchParam(name: string, value?: string, replace = false) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(name, value);
      else next.delete(name);
      return next;
    }, { replace });
  }

  function selectDirectory(path: string) {
    const next = normalizeLegacyLibrarySearch(searchParams).search;
    next.delete("file");
    next.delete("preview");
    setTreeDrawerOpen(false);
    navigate({ pathname: projectLibraryPath(projectId, path), search: next.size ? `?${next}` : "" });
  }

  function selectAsset(asset: MaterialAsset, presentation: PreviewPresentation, replace = false) {
    const next = normalizeLegacyLibrarySearch(searchParams).search;
    next.set("file", asset.id);
    if (presentation === "dialog") next.set("preview", "dialog");
    else next.delete("preview");
    setTreeDrawerOpen(false);
    const directoryPath = presentation === "dialog" ? selectedPath : directoryForAsset(asset.path);
    navigate(
      { pathname: projectLibraryPath(projectId, directoryPath), search: `?${next}` },
      { replace },
    );
  }

  function clearSelectedAsset(replace = false) {
    const next = new URLSearchParams(searchParams);
    next.delete("file");
    next.delete("preview");
    navigate(
      { pathname: projectLibraryPath(projectId, selectedPath), search: next.size ? `?${next}` : "" },
      { replace },
    );
  }

  function openMaterial(path: string, presentation: PreviewPresentation) {
    const target = assets.find((asset) => asset.path === path);
    if (!target) {
      setError(`链接目标“${path}”不在当前素材库中。`);
      return;
    }
    selectAsset(target, presentation, presentation === "dialog");
  }

  async function openLibrary() {
    try {
      await revealMaterial(projectId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法打开素材文件夹");
    }
  }

  const display: AssetDisplay = requestedDisplay === "grid" || requestedDisplay === "list"
    ? requestedDisplay
    : "grid";
  const selectedIndex = selectedAsset ? visibleAssets.findIndex((asset) => asset.id === selectedAsset.id) : -1;
  const dialogAsset = previewPresentation === "dialog" ? selectedAsset : undefined;
  const workspaceAsset = previewPresentation === "workspace" ? selectedAsset : undefined;
  const project = projects.find((candidate) => candidate.id === projectId);
  const selectedDirectory = directories.find((directory) => directory.path === selectedPath);
  const directoryMissing = !loading && Boolean(selectedPath) && !selectedDirectory;
  const title = selectedDirectory?.name ?? (selectedPath.split("/").at(-1) || "全部素材");
  const description = searching
    ? `在${searchScope === "project" ? "全项目" : "当前目录及子目录"}中查找匹配文件`
    : searchScope === "project"
      ? "显示全项目中的文件，同时保留当前目录的子文件夹入口"
      : selectedPath
        ? `显示“${selectedPath.replaceAll("/", " / ")}”中的子文件夹和全部文件`
        : "显示项目中的子文件夹和全部剧情、图片、视频及音频素材";
  const breadcrumbParts = selectedPath ? selectedPath.split("/") : [];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <BrandMark />
          <div><strong>{project?.name ?? projectId ?? "短剧素材库"}</strong><span>兜导 · 短剧 Harness · 素材工作台</span></div>
        </div>
        <div className="header-actions">
          {projects.length > 0 && (
            <select name="project-switcher" className="project-switcher" aria-label="切换短剧项目" value={projectId} onChange={(event) => navigate(projectLibraryPath(event.target.value))}>
              {projects.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          )}
          <ThemeToggle />
          <VideoPracticeNavLink compact />
          <Link className="course-link knowledge-link" to="/knowledge"><BrainCircuit size={18} /><span className="responsive-action-label" data-compact-label="知识库">导演知识库</span></Link>
          <Link className="course-link all-projects-link" to="/"><ArrowLeft size={18} /><span className="responsive-action-label" data-compact-label="项目">所有项目</span></Link>
          <button className="primary-button upload-material-button" type="button" onClick={openUpload}><UploadCloud size={18} /><span className="responsive-action-label" data-compact-label="导入">导入素材</span></button>
          <button className="secondary-button open-library-button" type="button" onClick={openLibrary}><FolderOpen size={18} /><span className="responsive-action-label" data-compact-label="素材">打开素材文件夹</span></button>
          <button className="secondary-button refresh-button" type="button" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw size={18} className={loading ? "spinning" : ""} /><span className="responsive-action-label" data-compact-label="刷新">刷新</span>
          </button>
        </div>
      </header>

      <ProjectViewTabs projectId={projectId} active="library" />

      <div className="path-bar" aria-label="当前位置">
        <div className="breadcrumbs">
          <Link to="/">所有项目</Link><i>/</i>
          <button type="button" className={!selectedPath ? "current" : ""} onClick={() => selectDirectory("")}>{project?.name ?? projectId}</button>
          {breadcrumbParts.map((part, index) => {
            const path = breadcrumbParts.slice(0, index + 1).join("/");
            const current = index === breadcrumbParts.length - 1;
            return <span className="breadcrumb-part" key={path}><i>/</i><button type="button" className={current ? "current" : ""} onClick={() => selectDirectory(path)}>{part}</button></span>;
          })}
        </div>
      </div>

      <main
        ref={layoutRef}
        className={`library-layout${workspaceAsset ? " has-selection" : ""}`}
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        {treeDrawerOpen && <button className="tree-drawer-backdrop" type="button" aria-label="关闭文件树" onClick={() => setTreeDrawerOpen(false)} />}
        <div className={`tree-pane${treeDrawerOpen ? " open" : ""}`}>
          <button className="tree-drawer-close" type="button" onClick={() => setTreeDrawerOpen(false)} aria-label="关闭文件树"><X size={18} />关闭</button>
          <Sidebar
            key={projectId}
            projectId={projectId}
            assets={assets}
            directories={directories}
            selectedPath={selectedPath}
            selectedFileId={selectedAsset?.id}
            onSelectPath={selectDirectory}
            onSelectAsset={(asset) => selectAsset(asset, "workspace")}
          />
        </div>
        <div
          className="panel-resizer sidebar-resizer"
          role="separator"
          aria-label="调整文件树宽度"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={Math.round(sidebarWidth)}
          tabIndex={0}
          title="左右拖动调整文件树宽度，双击恢复默认"
          onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            setSidebarWidth(constrainSidebarWidth(sidebarWidth + (event.key === "ArrowRight" ? RESIZE_STEP : -RESIZE_STEP)));
          }}
          onPointerDown={startResize}
          onPointerMove={resizePanels}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          onLostPointerCapture={stopResize}
        />

        {!workspaceAsset ? (
          <section className="file-browser">
            <header className="browser-heading">
              <button className="tree-drawer-trigger" type="button" onClick={() => setTreeDrawerOpen(true)}><PanelLeftOpen size={18} />文件树</button>
              <div><h1>{title}</h1><p title={description}>{description}</p></div>
              <span>{searching
                ? `${visibleAssets.length} / ${scopedAssets.length} 个文件`
                : `${currentDirectories.length} 个文件夹 · ${visibleAssets.length} 个文件`}</span>
            </header>

            <div className="browser-toolbar">
              <label className="file-search">
                <Search size={17} aria-hidden="true" />
                <span className="sr-only">搜索素材</span>
                <input name="material-query" value={query} onChange={(event) => updateSearchParam("search", event.target.value, true)} placeholder="搜索文件名、路径或正文" />
                {query && <button type="button" aria-label="清空搜索" onClick={() => updateSearchParam("search", undefined, true)}><X size={15} /></button>}
              </label>
              <label className="scope-control"><span>范围</span>
                <select name="material-scope" value={searchScope} onChange={(event) => updateSearchParam("scope", event.target.value === "current" ? undefined : event.target.value)}>
                  <option value="current">当前目录下</option>
                  <option value="project">全项目</option>
                </select>
              </label>
              <button className="content-search-toggle" type="button" aria-pressed={includeContent} onClick={() => updateSearchParam("content", includeContent ? undefined : "1")} title="同时搜索 Markdown 和文本正文">
                正文
              </button>
              <label className="sort-control"><span>排序</span>
                <select name="material-sort" value={sortMode} onChange={(event) => updateSearchParam("sort", event.target.value === "updated" ? undefined : event.target.value)}>
                  <option value="production">生产顺序</option>
                  <option value="updated">最近修改</option>
                  <option value="name">文件名称</option>
                </select>
              </label>
              <span className="display-switch" aria-label="文件显示方式">
                <button type="button" aria-pressed={display === "list"} onClick={() => updateSearchParam("display", "list")} title="列表视图"><List size={16} /></button>
                <button type="button" aria-pressed={display === "grid"} onClick={() => updateSearchParam("display", "grid")} title="缩略图视图"><Grid2X2 size={16} /></button>
              </span>
            </div>

            {textSearchLoading && <p className="inline-search-status"><RefreshCw size={13} className="spinning" />正在搜索文档正文…</p>}
            {textSearchError && <p className="inline-search-error" role="alert">{textSearchError}</p>}
            {(error || directoryMissing) && <div className="library-error" role="alert">{error || `目录“${selectedPath}”不存在。`}</div>}
            {loading && !assets.length
              ? <div className="loading-state"><RefreshCw size={24} className="spinning" />正在扫描本地文件夹…</div>
              : (
                <>
                  {!directoryMissing && (
                    <DirectoryList directories={currentDirectories} display={display} onSelect={selectDirectory} />
                  )}
                  {!directoryMissing && currentDirectories.length > 0 && visibleAssets.length > 0 && (
                    <div className="browser-section-heading file-section-heading"><h2>文件</h2><span>{visibleAssets.length} 个</span></div>
                  )}
                  {(directoryMissing || visibleAssets.length > 0 || currentDirectories.length === 0) && (
                    <FileList
                      assets={directoryMissing ? [] : visibleAssets}
                      selectedId={dialogAsset?.id}
                      display={display}
                      snippets={textMatches}
                      emptySearch={searching}
                      directoryPath={selectedPath}
                      projectId={projectId}
                      onSelect={(asset) => selectAsset(asset, "dialog")}
                    />
                  )}
                </>
              )}
          </section>
        ) : (
          <PreviewPane
            projectId={projectId}
            asset={workspaceAsset}
            hasPrevious={selectedIndex > 0}
            hasNext={selectedIndex >= 0 && selectedIndex < visibleAssets.length - 1}
            onBack={() => clearSelectedAsset(true)}
            onPrevious={() => { const asset = visibleAssets[selectedIndex - 1]; if (asset) selectAsset(asset, "workspace"); }}
            onNext={() => { const asset = visibleAssets[selectedIndex + 1]; if (asset) selectAsset(asset, "workspace"); }}
            onOpenMaterial={(path) => openMaterial(path, "workspace")}
          />
        )}

        {dialogAsset && (
          <FilePreviewDialog assetName={dialogAsset.name} onClose={() => clearSelectedAsset(true)}>
            <PreviewPane
              projectId={projectId}
              asset={dialogAsset}
              presentation="dialog"
              hasPrevious={selectedIndex > 0}
              hasNext={selectedIndex >= 0 && selectedIndex < visibleAssets.length - 1}
              onBack={() => clearSelectedAsset(true)}
              onPrevious={() => { const asset = visibleAssets[selectedIndex - 1]; if (asset) selectAsset(asset, "dialog", true); }}
              onNext={() => { const asset = visibleAssets[selectedIndex + 1]; if (asset) selectAsset(asset, "dialog", true); }}
              onOpenMaterial={(path) => openMaterial(path, "dialog")}
            />
          </FilePreviewDialog>
        )}

        {uploadOpen && (
          <div className="upload-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeUpload(); }}>
            <section className="upload-dialog" role="dialog" aria-modal="true" aria-label="导入素材">
              <header className="upload-dialog-head">
                <div><UploadCloud size={22} /><h2>导入素材</h2></div>
                <button className="upload-close" type="button" onClick={closeUpload} disabled={uploading} aria-label="关闭"><X size={20} /></button>
              </header>
              <p className="upload-hint">文件会上传到项目 <code>library</code> 目录，支持多选与拖拽，单个文件最大 2 GB。</p>
              <label className="upload-field">
                <span>目标文件夹（相对 library，留空传到根目录）</span>
                <input
                  type="text"
                  value={uploadFolder}
                  onChange={(event) => { setUploadFolder(event.target.value); setUploadStatus(null); }}
                  placeholder="例如：图片/人物/阿福 或 视频/成片"
                />
                {suggestedFolder && !uploadFolder && <small>留空时按文件类型自动建议：<code>{suggestedFolder}</code></small>}
              </label>
              <div
                className={`upload-dropzone${dragOver ? " dragging" : ""}`}
                onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => { event.preventDefault(); setDragOver(false); pickFiles(event.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click(); }}
              >
                <UploadCloud size={34} />
                <strong>点击选择文件，或把文件拖到这里</strong>
                <span>图片 / 视频 / 音频 / 剧本文档都可以</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) => pickFiles(event.target.files)}
                />
              </div>
              {uploadFiles.length > 0 && (
                <ul className="upload-file-list">
                  {uploadFiles.map((file, index) => (
                    <li key={`${file.name}-${index}`}>
                      <span className="upload-file-name" title={file.name}>{file.name}</span>
                      <span className="upload-file-size">{formatBytes(file.size)}</span>
                      <button type="button" aria-label={`移除 ${file.name}`} disabled={uploading} onClick={() => setUploadFiles((prev) => prev.filter((_, i) => i !== index))}><X size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
              {uploadStatus && <p className={`upload-status ${uploadStatus.kind}`} role="status">{uploadStatus.text}</p>}
              <footer className="upload-dialog-foot">
                <button className="secondary-button" type="button" onClick={closeUpload} disabled={uploading}>取消</button>
                <button className="primary-button" type="button" disabled={!uploadFiles.length || uploading} onClick={() => void submitUpload()}>
                  {uploading ? <><RefreshCw size={16} className="spinning" />正在导入…</> : <><UploadCloud size={16} />导入 {uploadFiles.length || ""} 个文件</>}
                </button>
              </footer>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
