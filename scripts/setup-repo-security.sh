#!/usr/bin/env bash
# リポジトリのセキュリティ設定（docs/dependency-policy.md の4章・5章）。何度実行しても同じ状態になる
set -euo pipefail
REPO=chris949/party-toybox

echo "1/5 Dependabot alerts と security updates を有効にする"
gh api -X PUT "repos/$REPO/vulnerability-alerts" --silent
gh api -X PUT "repos/$REPO/automated-security-fixes" --silent

echo "2/5 シークレットスキャン（push の保護つき）・自動マージの許可・マージ後のブランチ削除"
gh api -X PATCH "repos/$REPO" --silent --input - <<'JSON'
{
  "allow_auto_merge": true,
  "delete_branch_on_merge": true,
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
JSON

echo "3/5 ラベルを作る"
gh label create "自動マージ" --repo "$REPO" --color 0e8a16 --description "小さな更新。チェックが通れば自動でマージされる" --force
gh label create "要解析" --repo "$REPO" --color d93f0b --description "中・大の更新。一次解析のあと、持ち主が判断する" --force
gh label create "dependencies" --repo "$REPO" --color 0366d6 --description "依存ライブラリの更新" --force

echo "4/5 main のルール（チェック必須・消去と強制上書きの禁止。持ち主は対象外）"
existing=$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name=="main を守る") | .id')
method=POST; path="repos/$REPO/rulesets"
if [ -n "$existing" ]; then method=PUT; path="repos/$REPO/rulesets/$existing"; fi
gh api -X "$method" "$path" --silent --input - <<'JSON'
{
  "name": "main を守る",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [ { "context": "check", "integration_id": 15368 } ] } }
  ]
}
JSON

echo "5/5 確認"
gh api "repos/$REPO" --jq '{allow_auto_merge, delete_branch_on_merge, secret_scanning: .security_and_analysis.secret_scanning.status, push_protection: .security_and_analysis.secret_scanning_push_protection.status}'
gh api "repos/$REPO/automated-security-fixes" --jq '{security_updates: .enabled}'
gh api "repos/$REPO/rulesets" --jq '.[] | {name, enforcement}'
echo "完了"
