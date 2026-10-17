package com.sprintboard;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;

/** Runs after CSRF validation and before password verification. */
final class LoginAttemptFilter extends OncePerRequestFilter {
  static final String PERMIT_ATTRIBUTE=LoginAttemptFilter.class.getName()+".permit";
  private final LoginSecurityService security;
  LoginAttemptFilter(LoginSecurityService security) { this.security=security; }
  @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)
      throws ServletException,IOException {
    String path=request.getRequestURI().substring(request.getContextPath().length());
    if (request.getMethod().equals("POST") && path.equals("/login")) {
      var permit=security.reserve(request.getParameter("username"),request.getRemoteAddr());
      if (!permit.allowed()) {
        response.setStatus(429);
        response.setHeader("Retry-After",Long.toString(permit.retrySeconds()));
        response.setHeader("Cache-Control","no-store");
        response.setContentType("text/html;charset=UTF-8");
        // Native form POST needs a usable response; do not echo request-controlled fields.
        response.getWriter().write("<!doctype html><html lang=\"tr\"><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Girişe kısa bir ara</title><link rel=\"icon\" href=\"data:,\"><link rel=\"stylesheet\" href=\"/login-limit.css\"><main><span>SPRINTBOARD</span><h1>Girişe kısa bir ara</h1><p>Çok fazla giriş denemesi yapıldı. En geç "+permit.retrySeconds()+" saniye sonra yeniden deneyin.</p><p>Bu uyarı bir hesabın var olup olmadığını belirtmez.</p><a href=\"/#/login\">Giriş ekranına dön</a></main></html>");
        return;
      }
      request.setAttribute(PERMIT_ATTRIBUTE,permit);
    }
    chain.doFilter(request,response);
  }
}
