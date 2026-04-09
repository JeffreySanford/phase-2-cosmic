# ~/.bashrc

# User specific aliases and functions
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'

# Enable git branch in prompt if available
if [ -f "/usr/share/git/completion/git-prompt.sh" ]; then
  source /usr/share/git/completion/git-prompt.sh
  export PS1='\u@\h \W$(__git_ps1 " (%s)")\$ '
else
  export PS1='\u@\h \W\$ '
fi

# Add user bin to PATH
export PATH="$HOME/bin:$PATH"
