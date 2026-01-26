#!/bin/bash
#
# skillbook installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/kurochenko/skillbook/main/install.sh | bash
#
# Options (via environment variables):
#   SKILLBOOK_INSTALL_DIR - Installation directory (default: ~/.local/bin)
#   SKILLBOOK_VERSION     - Specific version to install (default: latest)
#
# This script:
# 1. Detects your OS and architecture
# 2. Downloads the appropriate binary from GitHub Releases
# 3. Installs it to ~/.local/bin (or custom dir)
# 4. Adds to PATH if needed
# 5. Verifies checksum when available

set -euo pipefail

REPO="kurochenko/skillbook"
INSTALL_DIR="${SKILLBOOK_INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="skillbook"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info() {
	echo -e "${CYAN}info${NC}: $1"
}

success() {
	echo -e "${GREEN}success${NC}: $1"
}

warn() {
	echo -e "${YELLOW}warn${NC}: $1"
}

error() {
	echo -e "${RED}error${NC}: $1"
	exit 1
}

# Detect OS
detect_os() {
	case "$(uname -s)" in
	Darwin) echo "darwin" ;;
	Linux) echo "linux" ;;
	MINGW* | MSYS* | CYGWIN*) error "Windows is not supported. Use WSL or install from source on Linux/macOS." ;;
	*) error "Unsupported operating system: $(uname -s)" ;;
	esac
}

# Detect architecture
detect_arch() {
	case "$(uname -m)" in
	x86_64 | amd64) echo "x64" ;;
	arm64 | aarch64) echo "arm64" ;;
	*) error "Unsupported architecture: $(uname -m)" ;;
	esac
}

# Get the download URL for the binary
get_download_url() {
	local os="$1"
	local arch="$2"
	local tag="$3"

	local binary_name="skillbook-${os}-${arch}"

	if [ "$tag" = "latest" ]; then
		echo "https://github.com/${REPO}/releases/latest/download/${binary_name}"
	else
		echo "https://github.com/${REPO}/releases/download/${tag}/${binary_name}"
	fi
}

# Fetch latest tag from GitHub
get_latest_tag() {
	local url="https://api.github.com/repos/${REPO}/releases/latest"

	if command -v curl &>/dev/null; then
		curl -fsSL "$url" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p'
	elif command -v wget &>/dev/null; then
		wget -qO- "$url" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p'
	else
		error "Neither curl nor wget found. Please install one of them."
	fi
}

normalize_version() {
	local version="$1"
	version="${version#skillbook-v}"
	version="${version#skillbook-}"
	version="${version#v}"
	echo "$version"
}

resolve_tag() {
	local input="$1"
	if [[ "$input" == skillbook-* ]]; then
		echo "$input"
		return
	fi
	if [[ "$input" == v* ]]; then
		echo "$input"
		return
	fi
	echo "v${input}"
}

# Download file
download() {
	local url="$1"
	local dest="$2"

	info "Downloading from ${url}..."

	if command -v curl &>/dev/null; then
		curl -fsSL "$url" -o "$dest"
	elif command -v wget &>/dev/null; then
		wget -q "$url" -O "$dest"
	else
		error "Neither curl nor wget found. Please install one of them."
	fi
}

checksum_tool() {
	if command -v shasum &>/dev/null; then
		echo "shasum -a 256"
		return
	fi

	if command -v sha256sum &>/dev/null; then
		echo "sha256sum"
		return
	fi
}

verify_checksum() {
	local file_path="$1"
	local url="$2"
	local tool="$(checksum_tool)"

	if [ -z "$tool" ]; then
		warn "No SHA256 tool found; skipping checksum verification"
		return
	fi

	local checksum_url="${url}.sha256"
	local checksum_file
	checksum_file=$(mktemp)

	if command -v curl &>/dev/null; then
		curl -fsSL "$checksum_url" -o "$checksum_file" || {
			warn "Checksum not available; skipping verification"
			rm -f "$checksum_file"
			return
		}
	elif command -v wget &>/dev/null; then
		wget -q "$checksum_url" -O "$checksum_file" || {
			warn "Checksum not available; skipping verification"
			rm -f "$checksum_file"
			return
		}
	fi

	local expected
	local actual
	expected=$(cut -d ' ' -f1 "$checksum_file")
	actual=$($tool "$file_path" | cut -d ' ' -f1)
	if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
		rm -f "$checksum_file"
		error "Checksum verification failed"
	fi

	rm -f "$checksum_file"
}

# Check if directory is in PATH
is_in_path() {
	local dir="$1"
	case ":$PATH:" in
	*":${dir}:"*) return 0 ;;
	*) return 1 ;;
	esac
}

# Get shell config file
get_shell_config() {
	case "$(basename "$SHELL")" in
	zsh) echo "$HOME/.zshrc" ;;
	bash)
		if [ -f "$HOME/.bashrc" ]; then
			echo "$HOME/.bashrc"
		else
			echo "$HOME/.bash_profile"
		fi
		;;
	fish) echo "$HOME/.config/fish/config.fish" ;;
	*) echo "$HOME/.profile" ;;
	esac
}

main() {
	echo ""
	echo -e "${CYAN}  skillbook installer${NC}"
	echo ""

	# Detect platform
	local os=$(detect_os)
	local arch=$(detect_arch)
	info "Detected platform: ${os}-${arch}"

	local tag="${SKILLBOOK_VERSION:-}"
	if [ -z "$tag" ]; then
		info "Fetching latest version..."
		tag=$(get_latest_tag)
		if [ -z "$tag" ]; then
			warn "Could not determine latest version. Installing latest release."
			tag="latest"
		fi
	else
		tag=$(resolve_tag "$tag")
	fi

	local version="latest"
	if [ "$tag" != "latest" ]; then
		version=$(normalize_version "$tag")
		if [ -z "$version" ]; then
			error "Could not parse version tag. Please set SKILLBOOK_VERSION explicitly."
		fi
	fi
	info "Installing version: ${version}"

	# Prepare install directory
	mkdir -p "$INSTALL_DIR"

	# Download binary
	local download_url=$(get_download_url "$os" "$arch" "$tag")
	local tmp_file
	tmp_file=$(mktemp)
	trap 'rm -f "${tmp_file:-}"' EXIT
	download "$download_url" "$tmp_file"
	verify_checksum "$tmp_file" "$download_url"

	# Install binary
	local install_path="${INSTALL_DIR}/${BINARY_NAME}"

	mv "$tmp_file" "$install_path"
	trap - EXIT
	chmod +x "$install_path"

	success "Installed skillbook to ${install_path}"

	# Check if in PATH
	if ! is_in_path "$INSTALL_DIR"; then
		warn "${INSTALL_DIR} is not in your PATH"

		local shell_config=$(get_shell_config)
		local shell_name=$(basename "$SHELL")

		echo ""
		echo "Add this to your ${shell_config}:"
		echo ""

		if [ "$shell_name" = "fish" ]; then
			echo "  set -gx PATH \"${INSTALL_DIR}\" \$PATH"
		else
			echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
		fi

		echo ""
		echo "Then restart your terminal or run:"
		echo ""
		if [ "$shell_name" = "fish" ]; then
			echo "  source ${shell_config}"
		else
			echo "  source ${shell_config}"
		fi
		echo ""
	fi

	# Verify installation
	if command -v skillbook &>/dev/null || [ -x "$install_path" ]; then
		echo ""
		success "Installation complete!"
		echo ""
		echo "Run 'skillbook --help' to get started."
		echo "Run 'skillbook upgrade' to update to new versions."
		echo ""
	fi
}

main "$@"
