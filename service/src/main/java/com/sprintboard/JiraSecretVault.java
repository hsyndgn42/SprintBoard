package com.sprintboard;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Jira personal access token. Uses its own key file so a Slack key rotation cannot break Jira. */
@Component
public class JiraSecretVault {
 private final SecretVault vault;
 public JiraSecretVault(@Value("${sprintboard.jira.encryption-key:}") String configured,@Value("${sprintboard.jira.key-file:./service/data/jira-token.key}") String file){this.vault=new SecretVault(configured,file,"Jira","tokenı");}
 public String encrypt(String value){return vault.encrypt(value);}
 public String decrypt(String value){return vault.decrypt(value);}
}
