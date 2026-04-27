export type DdSectionWorkspaceRow = {
  id: string;
  section_key: string;
  status: string;
};

export type DdQuestionnaireWorkspace = {
  id: string;
  status: string | null;
  completed_at: string | null;
  sections: DdSectionWorkspaceRow[];
};
