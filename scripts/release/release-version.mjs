// ADRs 0087/0092: naming only. Exact source/tag authorization is enforced separately.
export function isAcceptedReleaseVersion(version) {
  return (
    typeof version === 'string' &&
    version === version.trim() &&
    /^(?:0\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)|5\.2\.0(?:-rc[0-9]{2})?|5\.3\.0(?:-rc[1-9][0-9]*)?)$/.test(
      version
    )
  );
}
