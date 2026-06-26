import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../types/organization";

export function useOrganizationReferences(token?: string | null) {
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [jobLevels, setJobLevels] = useState<OrganizationJobLevel[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!token) return;
      const [departmentRows, locationRows, jobLevelRows, positionRows] = await Promise.all([
        api.listDepartments(token).catch(() => ({ departments: [] })),
        api.listLocations(token).catch(() => ({ locations: [] })),
        api.listJobLevels(token).catch(() => ({ job_levels: [] })),
        api.listPositions(token).catch(() => ({ positions: [] }))
      ]);
      if (!active) return;
      setDepartments(departmentRows.departments);
      setLocations(locationRows.locations);
      setJobLevels(jobLevelRows.job_levels);
      setPositions(positionRows.positions);
    }
    void load();
    return () => { active = false; };
  }, [token]);

  return { departments, locations, jobLevels, positions };
}
