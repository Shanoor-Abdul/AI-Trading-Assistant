
git reset --hard origin/main
$branches = @(
"origin/feature/ai-signal-accuracy",
"origin/feature/live-visual-change-detection",
"origin/feature/live-visual-change-detection-v2",
"origin/feature/main-enhance-db-optimized",
"origin/feature/main-enhance-temp",
"origin/feature/main-enhance-temp2",
"origin/feature/main-enhance-temp3",
"origin/feature/main-enhance-work",
"origin/feature/main-enhance2",
"origin/feature/mobile-cleanup",
"origin/feature/mobile-plan-b-screen-share",
"origin/feature/mobile-plan-c-react-native",
"origin/feature/mobile-v1",
"origin/feature/mobile-v2-visual-history",
"origin/feature/web-mobile-view-v1",
"origin/refactor/live-analysis-architecture",
"origin/refactor/observation-optimization"
)

foreach ($b in $branches) {
    Write-Host "Merging $b"
    git merge $b -m "Merge $b"
    if ($LASTEXITCODE -ne 0) {
        git merge --abort
        git merge $b -X ours -m "Merge $b with -X ours"
        if ($LASTEXITCODE -ne 0) {
            git add .
            git commit -m "Force merge $b"
        }
    }
}

git merge origin/feature/main -X theirs -m "Merge feature/main"
if ($LASTEXITCODE -ne 0) { git add .; git commit -m "Force merge main" }
git merge origin/feature/main-enhance -X theirs -m "Merge feature/main-enhance"
if ($LASTEXITCODE -ne 0) { git add .; git commit -m "Force merge main-enhance" }

