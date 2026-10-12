#!/usr/bin/env bash

# Runs the standard offline directory scan or scans the exact staged Git index.
set -euo pipefail

project_root="$(git rev-parse --show-toplevel)"
cd "${project_root}"
scanner="${project_root}/.tools/gitleaks"
if [[ ! -x ${scanner} ]] || [[ $("${scanner}" version 2>&1) != '8.30.1' ]]; then
  printf 'Install the project-local Gitleaks 8.30.1 binary; see the secret-scanning documentation.\n' >&2
  exit 2
fi

# No verbose output or reports: auxiliary findings can contain unredacted values.
flags=(--redact=100 --no-banner --no-color --exit-code=183)
status=0
case "${1:-}" in
  '')
    if [[ $# -ne 0 ]]; then exit 2; fi
    "${scanner}" dir "${flags[@]}" . || status=$?
    if [[ ${status} -eq 0 ]]; then
      # Native dir mode does not follow links; Git stores their target text.
      git ls-files -z | (
        while IFS= read -r -d '' path; do
          if [[ -L ${path} ]]; then
            readlink "./${path}" || exit 1
          fi
        done
      ) | "${scanner}" stdin "${flags[@]}" || status=$?
    fi
    ;;
  --staged)
    if [[ $# -ne 1 ]]; then exit 2; fi
    "${scanner}" git --staged "${flags[@]}" . || status=$?
    ;;
  *)
    printf 'Usage: %s [--staged]\n' "$0" >&2
    exit 2
    ;;
esac

if [[ ${status} -ne 0 ]]; then
  if [[ ${status} -eq 183 ]]; then
    printf 'Secret scan rejected: credentials detected.\n' >&2
  else
    printf 'Secret scan rejected: operational failure (exit %s).\n' "${status}" >&2
  fi
  exit "${status}"
fi
