#!/usr/bin/env python3
"""Build, filter, and render reply or quote trees from tweet JSON/JSONL."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict, deque
from collections.abc import Callable, Iterable, Mapping, Sequence
from pathlib import Path
from typing import Any, TypedDict

Tweet = dict[str, Any]
TweetId = str


class ConversationTree(TypedDict):
    """Known nodes and relationships for one rendered tree or forest."""

    root: TweetId | None
    roots: list[TweetId]
    nodes: set[TweetId]
    children: dict[TweetId, list[TweetId]]
    parents: dict[TweetId, TweetId]


def normalize_id(value: Any) -> TweetId | None:
    """Normalize numeric/string IDs without losing 64-bit tweet precision."""
    if value is None or value == "":
        return None
    return str(value)


def normalize_tweet(tweet: Mapping[str, Any]) -> Tweet:
    """Copy a tweet and normalize the identifier fields used by this module."""
    result = dict(tweet)
    tweet_id = normalize_id(result.get("tweet_id"))
    if tweet_id is None:
        raise ValueError("Every tweet must have a non-empty tweet_id")
    result["tweet_id"] = tweet_id
    for field in ("conversation_id", "reply_to_tweet_id", "quoted_tweet_id"):
        result[field] = normalize_id(result.get(field))
    return result


def normalize_tweets(tweets: Iterable[Mapping[str, Any]]) -> list[Tweet]:
    """Normalize records and keep the last occurrence of each tweet ID."""
    by_id: dict[TweetId, Tweet] = {}
    for tweet in tweets:
        normalized = normalize_tweet(tweet)
        by_id[normalized["tweet_id"]] = normalized
    return list(by_id.values())


def index_tweets(tweets: Iterable[Mapping[str, Any]]) -> dict[TweetId, Tweet]:
    return {tweet["tweet_id"]: tweet for tweet in normalize_tweets(tweets)}


def load_tweets(path: str | Path) -> list[Tweet]:
    """Load a JSON list, ``{"tweets": [...]}``, ID mapping, or JSONL file."""
    source = Path(path)
    text = source.read_text(encoding="utf-8")
    if source.suffix.lower() == ".jsonl":
        records = [json.loads(line) for line in text.splitlines() if line.strip()]
        return normalize_tweets(records)

    payload = json.loads(text)
    if isinstance(payload, list):
        records = payload
    elif isinstance(payload, dict) and isinstance(payload.get("tweets"), list):
        records = payload["tweets"]
    elif (
        isinstance(payload, dict)
        and payload
        and all(isinstance(value, dict) for value in payload.values())
    ):
        records = [
            {**value, "tweet_id": value.get("tweet_id", tweet_id)}
            for tweet_id, value in payload.items()
        ]
    elif payload == {}:
        records = []
    elif isinstance(payload, dict):
        records = [payload]
    else:
        raise ValueError(f"Unsupported tweet payload in {source}")
    return normalize_tweets(records)


def _sort_key(tweet_id: TweetId) -> tuple[int, int | str]:
    return (0, int(tweet_id)) if tweet_id.isdigit() else (1, tweet_id)


def _would_cycle(
    child: TweetId, parent: TweetId, parents: Mapping[TweetId, TweetId]
) -> bool:
    current: TweetId | None = parent
    seen = {child}
    while current is not None:
        if current in seen:
            return True
        seen.add(current)
        current = parents.get(current)
    return False


def _make_tree(
    nodes: set[TweetId],
    candidate_parents: Mapping[TweetId, TweetId],
    preferred_root: TweetId | None = None,
) -> ConversationTree:
    parents: dict[TweetId, TweetId] = {}
    children: defaultdict[TweetId, list[TweetId]] = defaultdict(list)

    for child in sorted(nodes, key=_sort_key):
        parent = candidate_parents.get(child)
        if parent is None or parent not in nodes or parent == child:
            continue
        if _would_cycle(child, parent, parents):
            continue
        parents[child] = parent
        children[parent].append(child)

    roots = sorted((node for node in nodes if node not in parents), key=_sort_key)
    for child_ids in children.values():
        child_ids.sort(key=_sort_key)
    root = preferred_root if preferred_root in roots else (roots[0] if roots else None)
    return {
        "root": root,
        "roots": roots,
        "nodes": nodes,
        "children": dict(children),
        "parents": parents,
    }


def build_conversation_trees(
    tweets: Iterable[Mapping[str, Any]],
) -> dict[str, ConversationTree]:
    """Group known tweets by conversation and build their reply relationships."""
    normalized = normalize_tweets(tweets)
    grouped: defaultdict[str, list[Tweet]] = defaultdict(list)
    for tweet in normalized:
        conversation_id = tweet.get("conversation_id") or tweet["tweet_id"]
        grouped[conversation_id].append(tweet)

    trees: dict[str, ConversationTree] = {}
    for conversation_id, records in grouped.items():
        nodes = {record["tweet_id"] for record in records}
        candidate_parents = {
            record["tweet_id"]: record["reply_to_tweet_id"]
            for record in records
            if record.get("reply_to_tweet_id") is not None
        }
        trees[conversation_id] = _make_tree(nodes, candidate_parents, conversation_id)
    return trees


def build_quote_trees(
    tweets: Iterable[Mapping[str, Any]],
) -> dict[str, ConversationTree]:
    """Build one known-data tree for each root of the quote relationship graph."""
    normalized = normalize_tweets(tweets)
    tweet_ids = {tweet["tweet_id"] for tweet in normalized}
    quote_parents = {
        tweet["tweet_id"]: tweet["quoted_tweet_id"]
        for tweet in normalized
        if tweet.get("quoted_tweet_id") in tweet_ids
    }
    whole_graph = _make_tree(tweet_ids, quote_parents)

    trees: dict[str, ConversationTree] = {}
    for root in whole_graph["roots"]:
        nodes: set[TweetId] = set()
        queue = deque([root])
        while queue:
            node = queue.popleft()
            if node in nodes:
                continue
            nodes.add(node)
            queue.extend(whole_graph["children"].get(node, []))
        trees[root] = _make_tree(nodes, quote_parents, root)
    return trees


def filter_conversation_trees(
    tweet_ids: Iterable[str | int],
    conversation_trees: Mapping[str, ConversationTree],
    tweet_dict: Mapping[TweetId, Mapping[str, Any]] | None = None,
    depth: int = 5,
    depth_up: int | None = None,
    depth_from_root: int | None = None,
) -> dict[str, ConversationTree]:
    """Keep selected nodes plus bounded known ancestors and descendants.

    ``tweet_dict`` remains an optional parameter for source-script API
    familiarity; tree membership is authoritative here. ``depth_from_root``
    controls descendants when the selected node is the tree's preferred root.
    """
    del tweet_dict
    if depth < 0:
        raise ValueError("depth cannot be negative")
    up_limit = depth if depth_up is None else depth_up
    root_down_limit = depth if depth_from_root is None else depth_from_root
    if up_limit < 0 or root_down_limit < 0:
        raise ValueError("depth limits cannot be negative")

    targets = {normalize_id(tweet_id) for tweet_id in tweet_ids}
    targets.discard(None)
    filtered: dict[str, ConversationTree] = {}

    for tree_id, tree in conversation_trees.items():
        local_targets = targets.intersection(tree["nodes"])
        if not local_targets:
            continue
        included: set[TweetId] = set()

        for target in local_targets:
            included.add(target)
            current = target
            for _ in range(up_limit):
                parent = tree["parents"].get(current)
                if parent is None:
                    break
                included.add(parent)
                current = parent

            down_limit = root_down_limit if target == tree["root"] else depth
            queue = deque([(target, 0)])
            while queue:
                node, current_depth = queue.popleft()
                if current_depth >= down_limit:
                    continue
                for child in tree["children"].get(node, []):
                    included.add(child)
                    queue.append((child, current_depth + 1))

        candidate_parents = {
            node: parent
            for node, parent in tree["parents"].items()
            if node in included and parent in included
        }
        filtered[tree_id] = _make_tree(included, candidate_parents, tree["root"])
    return filtered


def render_header_default(tweet: Mapping[str, Any]) -> str:
    username = tweet.get("username") or "unknown"
    created_at = str(tweet.get("created_at") or "")[:10]
    stats = []
    for field, icon in (
        ("favorite_count", "♥"),
        ("retweet_count", "↻"),
        ("quoted_count", "❝"),
    ):
        if tweet.get(field):
            stats.append(f"{icon} {tweet[field]}")
    suffix = f" {' '.join(stats)}" if stats else ""
    return f"{tweet['tweet_id']} [{created_at}] @{username}{suffix}"


def strand_header_print_factory(
    seed_info: Mapping[str | int, str],
) -> Callable[[Mapping[str, Any]], str]:
    normalized_info = {str(tweet_id): source for tweet_id, source in seed_info.items()}

    def render(tweet: Mapping[str, Any]) -> str:
        base = render_header_default(tweet)
        source = normalized_info.get(str(tweet.get("tweet_id")))
        return f"{base} [(SEED) type={source}]" if source else base

    return render


def _description_lines(value: Any) -> list[str]:
    if isinstance(value, str):
        return value.splitlines() or [value]
    if isinstance(value, Mapping):
        return str(value.get("description") or "").splitlines()
    return [str(value)]


def _render_tree_node(
    node_id: TweetId,
    visible_nodes: set[TweetId],
    tree: ConversationTree,
    tweets: Mapping[TweetId, Mapping[str, Any]],
    render_header: Callable[[Mapping[str, Any]], str],
    image_descriptions: Mapping[TweetId, Sequence[Any]],
    *,
    prefix: str = "",
    is_last_child: bool = True,
    is_root: bool = True,
    is_linear: bool = False,
    seen: set[TweetId] | None = None,
) -> list[str]:
    seen = set() if seen is None else seen
    if node_id in seen:
        return [f"{prefix}[cycle to {node_id} omitted]"]
    seen.add(node_id)

    tweet = tweets.get(node_id)
    if tweet is None:
        return [f"{prefix}[missing tweet {node_id}]"]

    connector = "" if is_root or is_linear else ("└── " if is_last_child else "├── ")
    lines = [f"{prefix}{connector}{render_header(tweet)}"]
    if is_root or is_linear:
        child_prefix = content_prefix = prefix
    else:
        child_prefix = content_prefix = prefix + ("    " if is_last_child else "│   ")

    text_lines = str(tweet.get("full_text") or "").splitlines() or [""]
    lines.extend(f"{content_prefix}{line}" for line in text_lines)

    quoted_id = normalize_id(tweet.get("quoted_tweet_id"))
    if quoted_id is not None:
        quoted = tweets.get(quoted_id)
        if quoted:
            quoted_text = " ".join(str(quoted.get("full_text") or "").splitlines())
            lines.append(
                f"{content_prefix}  [Quoting @{quoted.get('username', 'unknown')}: {quoted_text}]"
            )
        else:
            lines.append(f"{content_prefix}  [Quoting Tweet {quoted_id} (missing)]")

    descriptions = image_descriptions.get(node_id, [])
    if descriptions:
        lines.append(f"{content_prefix}Images:")
        for index, description in enumerate(descriptions, start=1):
            for line_index, line in enumerate(_description_lines(description)):
                marker = f"  - [Image #{index}] " if line_index == 0 else "    "
                lines.append(f"{content_prefix}{marker}{line}")

    children = [
        child for child in tree["children"].get(node_id, []) if child in visible_nodes
    ]
    if len(children) == 1:
        lines.append(f"{content_prefix}↓")
        lines.extend(
            _render_tree_node(
                children[0],
                visible_nodes,
                tree,
                tweets,
                render_header,
                image_descriptions,
                prefix=child_prefix,
                is_root=False,
                is_linear=True,
                seen=seen,
            )
        )
    else:
        for index, child in enumerate(children):
            lines.extend(
                _render_tree_node(
                    child,
                    visible_nodes,
                    tree,
                    tweets,
                    render_header,
                    image_descriptions,
                    prefix=child_prefix,
                    is_last_child=index == len(children) - 1,
                    is_root=False,
                    seen=seen,
                )
            )
    return lines


def render_conversation_trees(
    filtered_trees: Mapping[str, ConversationTree],
    tweet_dict: Mapping[TweetId, Mapping[str, Any]],
    render_header: Callable[[Mapping[str, Any]], str] = render_header_default,
    image_descriptions: Mapping[str | int, Sequence[Any]] | None = None,
) -> str:
    """Render known tree components deterministically in a ``tree``-like form."""
    normalized_images = {
        str(tweet_id): descriptions
        for tweet_id, descriptions in (image_descriptions or {}).items()
    }
    output: list[str] = []
    for tree_id in sorted(filtered_trees, key=_sort_key):
        tree = filtered_trees[tree_id]
        for root in tree["roots"]:
            output.extend(
                _render_tree_node(
                    root,
                    tree["nodes"],
                    tree,
                    tweet_dict,
                    render_header,
                    normalized_images,
                )
            )
            output.append("\n===\n")
    if output:
        output.pop()
    return "\n".join(output)


def print_conversation_threads(
    tweet_ids: Iterable[str | int],
    conversation_trees: Mapping[str, ConversationTree],
    tweet_dict: Mapping[TweetId, Mapping[str, Any]],
    depth: int = 5,
    render_header: Callable[[Mapping[str, Any]], str] = render_header_default,
) -> str:
    filtered = filter_conversation_trees(
        tweet_ids, conversation_trees, tweet_dict, depth
    )
    return render_conversation_trees(filtered, tweet_dict, render_header)


def _load_image_descriptions(path: str | Path | None) -> dict[str, Sequence[Any]]:
    if path is None:
        return {}
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise TypeError("Image descriptions must be a JSON object keyed by tweet ID")
    return {str(tweet_id): value for tweet_id, value in payload.items()}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Tweet JSON or JSONL file")
    parser.add_argument("--mode", choices=("replies", "quotes"), default="replies")
    parser.add_argument(
        "--tweet-id", action="append", default=[], help="Focus on this tweet ID"
    )
    parser.add_argument(
        "--conversation-id",
        action="append",
        default=[],
        help="Render only this complete tree",
    )
    parser.add_argument(
        "--depth", type=int, default=5, help="Ancestor/descendant focus depth"
    )
    parser.add_argument(
        "--images", help="JSON image-description mapping keyed by tweet ID"
    )
    parser.add_argument("--output", help="Write rendered text to this path")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    tweets = load_tweets(args.input)
    tweet_dict = index_tweets(tweets)
    trees = (
        build_conversation_trees(tweets)
        if args.mode == "replies"
        else build_quote_trees(tweets)
    )

    if args.conversation_id:
        requested = {str(value) for value in args.conversation_id}
        trees = {
            tree_id: tree for tree_id, tree in trees.items() if tree_id in requested
        }
    if args.tweet_id:
        trees = filter_conversation_trees(args.tweet_id, trees, tweet_dict, args.depth)

    rendered = render_conversation_trees(
        trees,
        tweet_dict,
        image_descriptions=_load_image_descriptions(args.images),
    )
    if args.output:
        Path(args.output).write_text(
            rendered + ("\n" if rendered else ""), encoding="utf-8"
        )
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
