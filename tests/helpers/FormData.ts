export function createFormData(key: string, value: string) {
  const formData = new FormData();
  formData.append(key, value);
  return formData
}
