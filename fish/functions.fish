# Custom Fish functions

# Function to update auth-related repositories
function uacc
    set -l repos auth-svc acc-svc login-page
    set -l base_dir ~/ahg

    # Save current directory to return later
    set -l original_dir (pwd)

    for repo in $repos
        set -l repo_path $base_dir/$repo

        if not test -d $repo_path
            echo "⚠️  Repository not found: $repo_path"
            continue
        end

        echo "📦 Updating $repo..."
        cd $repo_path

        if git checkout master 2>/dev/null
            git pull origin master
            echo "✅ $repo updated successfully"
        else
            echo "❌ Failed to checkout master in $repo"
        end
        echo ""
    end

    # Return to original directory
    cd $original_dir
    echo "🎉 All repositories processed!"
end
