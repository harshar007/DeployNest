from typing import List, Dict, Any, Optional
import httpx

GITHUB_API_BASE = "https://api.github.com"
DEFAULT_HEADERS = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "DeployNest-Python-Backend",
}


def _get_headers(token: str) -> Dict[str, str]:
    return {
        **DEFAULT_HEADERS,
        "Authorization": f"Bearer {token}",
    }


async def validate_github_token(token: str) -> Dict[str, Any]:
    """
    Validates a personal access token by fetching authenticated user details
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{GITHUB_API_BASE}/user",
            headers=_get_headers(token),
            timeout=10.0,
        )
        if response.status_code != 200:
            error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
            err_msg = error_data.get("message", response.text)
            raise ValueError(f"GitHub API Error ({response.status_code}): {err_msg}")

        data = response.json()
        return {
            "id": str(data.get("id")),
            "username": data.get("login"),
            "name": data.get("name") or data.get("login"),
            "avatarUrl": data.get("avatar_url"),
            "email": data.get("email"),
        }


async def fetch_user_repositories(token: str) -> List[Dict[str, Any]]:
    """
    Fetches all repositories accessible by the user (with pagination)
    """
    repos: List[Dict[str, Any]] = []
    page = 1
    per_page = 100

    async with httpx.AsyncClient() as client:
        while True:
            response = await client.get(
                f"{GITHUB_API_BASE}/user/repos",
                headers=_get_headers(token),
                params={
                    "per_page": per_page,
                    "page": page,
                    "sort": "updated",
                    "affiliation": "owner,collaborator,organization_member",
                },
                timeout=20.0,
            )
            if response.status_code != 200:
                break

            items = response.json()
            if not isinstance(items, list) or len(items) == 0:
                break

            for r in items:
                repos.append({
                    "id": r.get("id"),
                    "name": r.get("name"),
                    "fullName": r.get("full_name"),
                    "owner": r.get("owner", {}).get("login", ""),
                    "cloneUrl": r.get("clone_url"),
                    "htmlUrl": r.get("html_url"),
                    "defaultBranch": r.get("default_branch", "main"),
                    "isPrivate": r.get("private", False),
                    "description": r.get("description"),
                    "language": r.get("language"),
                    "updatedAt": r.get("updated_at"),
                })

            if len(items) < per_page:
                break
            page += 1

    return repos


async def fetch_repo_branches(token: str, owner: str, repo: str) -> List[str]:
    """
    Fetches available branch names for a repository
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/branches",
                headers=_get_headers(token),
                params={"per_page": 50},
                timeout=10.0,
            )
            if response.status_code == 200:
                data = response.json()
                return [b.get("name") for b in data if isinstance(b, dict) and "name" in b]
            return ["main", "master"]
        except Exception as err:
            print(f"Failed to list branches for {owner}/{repo}: {err}")
            return ["main", "master"]


async def fetch_latest_commit(
    token: str,
    owner: str,
    repo: str,
    branch: str
) -> Optional[Dict[str, str]]:
    """
    Fetches the latest commit SHA, message, and author for a branch
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/commits/{branch}",
                headers=_get_headers(token),
                timeout=10.0,
            )
            if response.status_code == 200:
                data = response.json()
                sha = data.get("sha", "")[:7]
                commit_obj = data.get("commit", {})
                message = commit_obj.get("message", "").split("\n")[0]
                author_name = (
                    commit_obj.get("author", {}).get("name")
                    or data.get("author", {}).get("login")
                    or "Unknown"
                )
                return {
                    "sha": sha,
                    "message": message,
                    "author": author_name,
                }
            return None
        except Exception as err:
            print(f"Failed to get latest commit for {owner}/{repo}@{branch}: {err}")
            return None


async def setup_github_webhook(
    token: str,
    owner: str,
    repo: str,
    webhook_url: str,
    secret: str
) -> Optional[str]:
    """
    Registers a push webhook on the target GitHub repository
    """
    async with httpx.AsyncClient() as client:
        try:
            # 1. Check existing hooks to avoid duplicates
            list_res = await client.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/hooks",
                headers=_get_headers(token),
                timeout=10.0,
            )
            if list_res.status_code == 200:
                hooks = list_res.json()
                for h in hooks:
                    config = h.get("config", {})
                    if config.get("url") == webhook_url:
                        return str(h.get("id"))

            # 2. Create new webhook
            create_payload = {
                "name": "web",
                "active": True,
                "events": ["push"],
                "config": {
                    "url": webhook_url,
                    "content_type": "json",
                    "secret": secret,
                    "insecure_ssl": "0",
                },
            }
            create_res = await client.post(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/hooks",
                headers=_get_headers(token),
                json=create_payload,
                timeout=10.0,
            )
            if create_res.status_code in (200, 201):
                created = create_res.json()
                return str(created.get("id"))
            else:
                print(f"Failed to create webhook ({create_res.status_code}): {create_res.text}")
                return None
        except Exception as err:
            print(f"Failed to configure GitHub webhook for {owner}/{repo}: {err}")
            return None


async def delete_github_webhook(
    token: str,
    owner: str,
    repo: str,
    hook_id: str
) -> bool:
    """
    Deletes a registered webhook from GitHub
    """
    async with httpx.AsyncClient() as client:
        try:
            res = await client.delete(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/hooks/{hook_id}",
                headers=_get_headers(token),
                timeout=10.0,
            )
            return res.status_code in (200, 204)
        except Exception as err:
            print(f"Failed to delete webhook for {owner}/{repo}: {err}")
            return False
