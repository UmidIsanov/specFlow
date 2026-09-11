import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import ProjectTabs from "@/components/ProjectTabs";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await api<Project>(`/projects/${id}`);

  return (
    <div>
      <div className="no-print mb-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <span className="text-sm text-ink-400">
            {project.customer ?? ""} {project.code ? `· ${project.code}` : ""}
          </span>
        </div>
        <ProjectTabs projectId={id} />
      </div>
      {children}
    </div>
  );
}
