#!/bin/bash
cd "$(dirname "$0")" || exit 1

echo "正在检查项目改动..."

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "当前文件夹还不是 Git 仓库。"
  echo "请先完成第一次 GitHub 上传设置。"
  echo ""
  echo "按回车键关闭窗口。"
  read -r
  exit 1
fi

git add .

if git diff --cached --quiet; then
  echo "没有新的改动需要上传。"
  echo ""
  echo "按回车键关闭窗口。"
  read -r
  exit 0
fi

commit_message="Update desktop pet $(date '+%Y-%m-%d %H:%M')"
echo "正在提交：$commit_message"
git commit -m "$commit_message"

if [ $? -ne 0 ]; then
  echo "提交失败，请查看上面的错误信息。"
  echo ""
  echo "按回车键关闭窗口。"
  read -r
  exit 1
fi

echo "正在上传到 GitHub..."
git push

if [ $? -eq 0 ]; then
  echo ""
  echo "上传完成。"
else
  echo ""
  echo "上传失败，请查看上面的错误信息。"
fi

echo ""
echo "按回车键关闭窗口。"
read -r
