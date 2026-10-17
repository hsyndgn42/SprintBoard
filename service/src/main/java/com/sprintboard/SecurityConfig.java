package com.sprintboard;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.http.HttpStatus;
import java.time.Clock;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;

@Configuration
public class SecurityConfig {
  @Bean
  PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }

  @Bean
  Clock securityClock() { return Clock.systemUTC(); }

  @Bean
  SecurityFilterChain securityFilterChain(HttpSecurity http, AccountService accounts, LoginSecurityService loginSecurity) throws Exception {
    var success=new SimpleUrlAuthenticationSuccessHandler("/#/overview");
    success.setAlwaysUseDefaultTargetUrl(true);
    http
        .addFilterBefore(new AccountSessionFilter(accounts), CsrfFilter.class)
        .addFilterBefore(new LoginAttemptFilter(loginSecurity), UsernamePasswordAuthenticationFilter.class)
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/api/health", "/api/auth/session", "/api/auth/setup").permitAll()
            .requestMatchers(HttpMethod.POST, "/api/auth/password").authenticated()
            .requestMatchers("/api/self/**").authenticated()
            .requestMatchers("/api/admin/**").hasRole("ADMIN")
            .requestMatchers("/api/export").hasRole("ADMIN")
            .requestMatchers(HttpMethod.GET, "/api/**").authenticated()
            .requestMatchers("/api/**").hasRole("ADMIN")
            .anyRequest().permitAll())
        .exceptionHandling(errors -> errors.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
        .formLogin(form -> form.loginPage("/").loginProcessingUrl("/login")
            .successHandler((request,response,authentication)-> {
              loginSecurity.success((LoginSecurityService.Permit)request.getAttribute(LoginAttemptFilter.PERMIT_ATTRIBUTE),authentication.getName(),request.getRemoteAddr());
              success.onAuthenticationSuccess(request,response,authentication);
            })
            .failureHandler((request,response,exception)-> {
              loginSecurity.failure(request.getParameter("username"),request.getRemoteAddr());
              response.sendRedirect("/#/login?error=1");
            }).permitAll())
        .logout(logout -> logout.logoutSuccessUrl("/#/login").permitAll())
        .headers(headers -> headers.frameOptions(frame -> frame.deny()));
    return http.build();
  }
}
