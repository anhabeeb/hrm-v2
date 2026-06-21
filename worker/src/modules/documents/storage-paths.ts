export function employeeDocumentPrefix(employeeId: string) {
  return `employees/${employeeId}/documents/`;
}

export function employeeProfilePhotoKey(employeeId: string, fileName: string) {
  return `employees/${employeeId}/profile-photos/${fileName}`;
}
